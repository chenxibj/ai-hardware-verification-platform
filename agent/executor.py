"""任务执行模块 (#225 实时日志 + #226 async + #229 结构化日志 + #243 LogReporter)
#402: ThreadPoolExecutor 并发执行多任务"""
import json
import logging
import os
import platform
import re
import random
import subprocess
import threading
import time
import signal as _signal
from concurrent.futures import ThreadPoolExecutor as _ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional, Dict, List
import requests
# #507: dead import removed
try:
    from log_reporter import LogReporter
    HAS_LOG_REPORTER = True
except ImportError:
    HAS_LOG_REPORTER = False

# #521: eval output schema validation
try:
    from eval_validator import validate_eval_output, EvalValidationError, build_no_data_result
    HAS_EVAL_VALIDATOR = True
except ImportError:
    HAS_EVAL_VALIDATOR = False

logger = logging.getLogger(__name__)

# #216: 上报失败时本地持久化目录
PENDING_DIR = "/tmp/ahvp-pending-results"

# #504: 动态超时配置（秒）
TIMEOUT_MAP = {"OPERATOR": 300, "MODEL": 1200, "TRAINING": 7200}
DEFAULT_TIMEOUT = 600  # fallback 超时
NO_OUTPUT_TIMEOUT = 120  # 2分钟无输出判定卡死


# #506: Progress extraction patterns
_PROGRESS_PATTERNS = [
    (r'\[(\d+)\s*/\s*(\d+)\]', 'fraction'),       # [3/10]
    (r'[Ee]poch\s+(\d+)\s*/\s*(\d+)', 'fraction'),  # Epoch 3/10
    (r'[Ss]tep\s+(\d+)\s*/\s*(\d+)', 'fraction'),   # Step 50/200
    (r'(\d+(?:\.\d+)?)\s*%', 'percent'),               # 45%
]


class ProgressReporter:
    """#506: Throttled progress reporting — report every 10% change or 10 seconds."""

    THROTTLE_PERCENT = 10
    THROTTLE_SECONDS = 10

    def __init__(self, task_id, platform_url, token):
        self.task_id = task_id
        self.platform_url = platform_url
        self.token = token
        self._last_reported_progress = None
        self._last_report_time = 0
        self._lock = threading.Lock()

    def maybe_report(self, progress):
        """Report progress if threshold met (10% change or 10s elapsed)."""
        if progress is None:
            return
        progress = max(0, min(100, int(progress)))

        with self._lock:
            now = time.time()
            should_report = False

            if self._last_reported_progress is None:
                should_report = True
            elif abs(progress - self._last_reported_progress) >= self.THROTTLE_PERCENT:
                should_report = True
            elif (now - self._last_report_time) >= self.THROTTLE_SECONDS:
                should_report = True

            if should_report:
                self._do_report(progress)
                self._last_reported_progress = progress
                self._last_report_time = now

    def _do_report(self, progress):
        """POST progress to platform."""
        try:
            url = "{}/tasks/{}/progress".format(self.platform_url, self.task_id)
            requests.post(
                url,
                params={"progress": progress},
                headers={"X-Agent-Token": self.token},
                timeout=5,
            )
            logger.debug("Progress reported for task %s: %d%%", self.task_id, progress)
        except Exception as e:
            logger.debug("Progress report failed for task %s: %s", self.task_id, e)


class AsyncResultReporter:
    """#506: Background thread for result reporting — doesn't block worker."""

    def __init__(self, platform_url, token, max_retries=3, backoff_base=1):
        self.platform_url = platform_url
        self.token = token
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self._queue = []
        self._lock = threading.Lock()
        self._event = threading.Event()
        self._thread = None
        self._stop = threading.Event()

    def start(self):
        self._thread = threading.Thread(target=self._worker, daemon=True, name="async-result-reporter")
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def submit(self, task_id, status, result, logs=""):
        """Non-blocking: enqueue a result for background reporting."""
        with self._lock:
            self._queue.append({
                "task_id": task_id,
                "status": status,
                "result": result,
                "logs": logs,
                "retries": 0,
            })
        self._event.set()

    def _worker(self):
        while not self._stop.is_set():
            self._event.wait(timeout=5)
            self._event.clear()

            while True:
                with self._lock:
                    if not self._queue:
                        break
                    item = self._queue.pop(0)

                task_id = item["task_id"]
                status = item["status"]
                result = item["result"]
                logs = item["logs"]
                retries = item["retries"]

                if status == "FAILED":
                    url = "{}/tasks/{}/failure".format(self.platform_url, task_id)
                    payload = {
                        "error": result.get("error", "Unknown") if isinstance(result, dict) else str(result),
                        "logs": logs[-10000:] if logs else "",
                    }
                else:
                    url = "{}/tasks/{}/result".format(self.platform_url, task_id)
                    payload = {"status": status, "result": result, "logs": logs[-10000:] if logs else ""}

                headers = {"Content-Type": "application/json", "X-Agent-Token": self.token}

                try:
                    resp = requests.post(url, json=payload, headers=headers, timeout=30)
                    if resp.status_code == 200:
                        logger.info("AsyncResultReporter: task %s OK", task_id)
                        continue
                    elif 400 <= resp.status_code < 500:
                        logger.warning("AsyncResultReporter: task %s rejected (%s)", task_id, resp.status_code)
                        continue
                except Exception as e:
                    logger.warning("AsyncResultReporter: task %s error: %s", task_id, e)

                if retries < self.max_retries:
                    item["retries"] = retries + 1
                    backoff = self.backoff_base * (2 ** retries)
                    time.sleep(backoff)
                    with self._lock:
                        self._queue.append(item)
                else:
                    logger.error("AsyncResultReporter: task %s exhausted retries", task_id)
                    self._save_pending(task_id, payload)

    def _save_pending(self, task_id, payload):
        try:
            os.makedirs(PENDING_DIR, exist_ok=True)
            import json as _json
            with open(os.path.join(PENDING_DIR, "{}.json".format(task_id)), "w") as f:
                _json.dump(payload, f, ensure_ascii=False)
        except Exception as e:
            logger.error("AsyncResultReporter save failed: %s", e)


import socket


def _find_free_port():
    """#480: Bind-then-release to get an available port (replaces random.randint)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]

class TaskExecutor:
    """管理评测任务的执行 — #402: 支持并发执行多个任务"""

    SCRIPT_MAP = {
        # 具体类型 — 优先使用统一版本（自动 CPU/GPU）
        "OPERATOR_BENCHMARK": "operator_benchmark.py",
        "MODEL_INFERENCE": "model_inference.py",
        "operator_benchmark": "operator_benchmark.py",
        "model_inference": "model_inference.py",
        # 简写类型（后端 evalType 字段值）
        "OPERATOR": "operator_benchmark.py",
        "MODEL": "model_inference.py",
        "operator": "operator_benchmark.py",
        "model": "model_inference.py",
        # 训练类型
        "TRAINING": "model_training_benchmark.py",
        "training": "model_training_benchmark.py",
        "MODEL_TRAINING": "model_training_benchmark.py",
        "model_training": "model_training_benchmark.py",
        # 通用 PERFORMANCE 类型 — 运行时根据 config 动态路由
        "PERFORMANCE": None,
        "performance": None,
    }

    # #225/#229: 日志上报配置
    LOG_FLUSH_INTERVAL = 5  # 秒
    LOG_FLUSH_LINES = 50    # 行

    @staticmethod
    def _extract_progress(line):
        """#506: Extract progress percentage from a log line.
        Returns int (0-100) or None."""
        if not line:
            return None
        for pattern, ptype in _PROGRESS_PATTERNS:
            m = re.search(pattern, line)
            if m:
                if ptype == 'fraction':
                    num, denom = int(m.group(1)), int(m.group(2))
                    if denom <= 0:
                        return None
                    return min(100, int(num * 100 / denom))
                elif ptype == 'percent':
                    return min(100, int(float(m.group(1))))
        return None

    # #402: 默认最大并发 worker 数
    DEFAULT_MAX_WORKERS = 4

    def __init__(self, config, node_id, max_workers=None):
        self.config = config
        self.node_id = node_id
        self.platform_url = config["platform"]["url"]
        self.token = config["platform"]["token"]
        # #220: 支持相对路径（相对于 agent 目录）
        scripts_dir = config["eval_scripts_dir"]
        if not os.path.isabs(scripts_dir):
            scripts_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), scripts_dir)
        self.scripts_dir = os.path.realpath(scripts_dir)
        # #220: project_root 也支持相对路径
        project_root = config["project_root"]
        if not os.path.isabs(project_root):
            project_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), project_root)
        self.project_root = os.path.realpath(project_root)

        # #506: pending results for retry
        self.pending_results = []

        # #402: ThreadPoolExecutor 替代单任务模式
        self.max_workers = max_workers or self.DEFAULT_MAX_WORKERS
        self._pool = _ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="task-worker")
        self._active_tasks = {}  # task_id -> Future
        self._task_info = {}     # task_id -> {eval_type, start_time}
        self._lock = threading.Lock()
        self._on_task_complete = None  # #402: callback for immediate re-poll

    @property
    def is_busy(self):
        """向后兼容：只要有任务就算 busy"""
        return self.active_task_count > 0

    @property
    def is_full(self):
        """#402: 所有 worker 都在忙"""
        return self.active_task_count >= self.max_workers

    @property
    def active_task_count(self):
        """当前正在执行的任务数"""
        with self._lock:
            # 清理已完成的任务
            done_tasks = [tid for tid, fut in self._active_tasks.items() if fut.done()]
            for tid in done_tasks:
                del self._active_tasks[tid]
                self._task_info.pop(tid, None)
            return len(self._active_tasks)

    @property
    def available_workers(self):
        """#402: 可用的 worker 数量"""
        return max(0, self.max_workers - self.active_task_count)

    @property
    def current_task(self):
        """向后兼容：返回第一个活跃任务的 ID"""
        with self._lock:
            if self._active_tasks:
                return next(iter(self._active_tasks))
            return None

    @property
    def current_tasks_info(self):
        """#402: 返回所有活跃任务的信息列表"""
        with self._lock:
            # 清理已完成任务
            done_tasks = [tid for tid, fut in self._active_tasks.items() if fut.done()]
            for tid in done_tasks:
                del self._active_tasks[tid]
                self._task_info.pop(tid, None)

            result = []
            for tid, info in self._task_info.items():
                elapsed = time.time() - info.get("start_time", time.time())
                result.append({
                    "task_id": tid,
                    "eval_type": info.get("eval_type"),
                    "running_seconds": round(elapsed, 1),
                })
            return result

    def set_on_task_complete(self, callback):
        """#402: 设置任务完成回调（用于任务完成后立即 re-poll）"""
        self._on_task_complete = callback

    def shutdown(self):
        """#400: 关闭线程池"""
        logger.info("正在关闭任务线程池...")
        self._pool.shutdown(wait=False)
        logger.info("任务线程池已关闭")

    @staticmethod
    def _set_task_limits():
        """#504: 评测脚本资源限制 — 降低优先级"""
        try:
            os.nice(5)
        except OSError:
            pass  # 非 root 或已超出范围时忽略

    def _get_timeout(self, eval_type, params):
        """#504: 动态超时 — 优先用后端传入的 timeout，fallback 到 TIMEOUT_MAP，最终 fallback DEFAULT_TIMEOUT"""
        # 1. 后端传入的 timeout 优先
        if isinstance(params, dict):
            explicit = params.get("timeout") or params.get("_timeout")
            if explicit and isinstance(explicit, (int, float)) and explicit > 0:
                return int(explicit)
        # 2. TIMEOUT_MAP by eval type
        eval_upper = (eval_type or "").upper()
        if eval_upper in TIMEOUT_MAP:
            return TIMEOUT_MAP[eval_upper]
        # 3. Fallback
        return DEFAULT_TIMEOUT

    def _resolve_script(self, eval_type, params):
        """根据 eval_type 和 params 解析实际要执行的脚本名"""
        eval_type = eval_type or ""
        script_name = self.SCRIPT_MAP.get(eval_type) or self.SCRIPT_MAP.get(eval_type.upper()) or self.SCRIPT_MAP.get(eval_type.lower())

        if script_name is None and eval_type.upper() != "PERFORMANCE":
            raise ValueError("未知的评测类型: {}".format(eval_type))
        if eval_type.upper() == "PERFORMANCE":
            has_operator = any(k in params for k in ("operator", "operators", "op"))
            has_model = any(k in params for k in ("model", "models", "batch_sizes", "batch_size"))
            if has_operator and not has_model:
                script_name = "operator_benchmark.py"
            elif has_model and not has_operator:
                script_name = "model_inference.py"
            else:
                script_name = "operator_benchmark.py"
            logger.info("PERFORMANCE 类型动态路由 -> %s (params keys: %s)", script_name, list(params.keys()))

        if script_name is None:
            raise ValueError("未知的评测类型: {}".format(eval_type))
        return script_name

    def execute_async(self, task_id, eval_type, params=None, chip_info=None):
        """#402: 异步执行评测任务（使用线程池）"""
        with self._lock:
            if task_id in self._active_tasks:
                raise RuntimeError("任务 {} 已在执行中".format(task_id))

            # 清理已完成任务
            done_tasks = [tid for tid, fut in self._active_tasks.items() if fut.done()]
            for tid in done_tasks:
                del self._active_tasks[tid]
                self._task_info.pop(tid, None)

            if len(self._active_tasks) >= self.max_workers:
                raise RuntimeError("Worker 已满 ({}/{}), 无法接受新任务".format(
                    len(self._active_tasks), self.max_workers))

            # 提交到线程池
            future = self._pool.submit(self._run_task, task_id, eval_type, params or {}, chip_info or {})
            self._active_tasks[task_id] = future
            self._task_info[task_id] = {
                "eval_type": eval_type,
                "start_time": time.time(),
            }
            logger.info("#402: 任务 %s 已提交线程池 (%d/%d workers busy)",
                        task_id, len(self._active_tasks), self.max_workers)

        # #509: Report progress=1% immediately after task is accepted into pool.
        # This prevents TaskRecoveryScheduler from timing out tasks that are
        # queued in the thread pool waiting for a free worker.
        try:
            progress_url = "{}/tasks/{}/progress".format(self.platform_url, task_id)
            requests.post(progress_url, params={"progress": 1},
                          headers={"X-Agent-Token": self.token}, timeout=5)
            logger.info("#509: Early progress=1%% reported for task %s (pool accepted)", task_id)
        except Exception as e:
            logger.warning("#509: Failed to report early progress for task %s: %s", task_id, e)

    @staticmethod
    def _classify_log_line(line):
        """
        #229: 分类日志行 — 支持嵌套 JSON 中的 metric 检测
        Returns: (log_type, level, metrics_dict_or_None)
        """
        stripped = line.strip()
        if not stripped:
            return ("TEXT", "INFO", None)

        # Try parsing as JSON
        if stripped.startswith("{"):
            try:
                obj = json.loads(stripped)
                # Deep-scan for metric keys (eval scripts nest them in results/summary)
                metric_prefixes = ("latency", "throughput", "fps", "bandwidth", "iops", "qps")
                found_metrics = {}

                def _extract_metrics(d):
                    """Recursively extract metric-like keys from dicts and lists."""
                    if isinstance(d, dict):
                        for k, v in d.items():
                            kl = k.lower()
                            if any(kl.startswith(p) or kl.endswith(p) for p in metric_prefixes):
                                if isinstance(v, (int, float)):
                                    found_metrics[k] = v
                            elif isinstance(v, (dict, list)):
                                _extract_metrics(v)
                    elif isinstance(d, list):
                        for item in d:
                            if isinstance(item, (dict, list)):
                                _extract_metrics(item)

                _extract_metrics(obj)

                # Also check top-level summary if present
                summary = obj.get("summary", {})
                if isinstance(summary, dict):
                    for k, v in summary.items():
                        kl = k.lower()
                        if any(kl.startswith(p) or kl.endswith(p) for p in metric_prefixes):
                            if isinstance(v, (int, float)):
                                found_metrics[k] = v

                if found_metrics:
                    return ("METRIC", "INFO", found_metrics)
                return ("TEXT", "INFO", None)
            except (json.JSONDecodeError, ValueError):
                pass

        # Check for progress pattern: [x/y] or x/y or x% or Step x of y
        progress_patterns = [
            r'\[?\d+\s*/\s*\d+\]?',          # [3/10] or 3/10
            r'\d+(\.\d+)?%',                   # 45% or 45.5%
            r'[Ss]tep\s+\d+\s+of\s+\d+',     # Step 3 of 10
            r'[Pp]rogress[:\s]+\d+',           # Progress: 50
        ]
        for pat in progress_patterns:
            if re.search(pat, stripped):
                return ("PROGRESS", "INFO", None)

        # Check for error indicators
        error_indicators = ["error", "exception", "traceback", "failed", "fatal"]
        lower = stripped.lower()
        for ind in error_indicators:
            if ind in lower:
                return ("TEXT", "ERROR", None)

        # Check for warning indicators
        warn_indicators = ["warning", "warn", "deprecated"]
        for ind in warn_indicators:
            if ind in lower:
                return ("TEXT", "WARN", None)

        return ("TEXT", "INFO", None)

    def _get_system_info(self):
        """Collect system info for SYSTEM log entry"""
        try:
            import psutil
            mem = psutil.virtual_memory()
            return {
                "hostname": platform.node(),
                "os": "{} {}".format(platform.system(), platform.release()),
                "arch": platform.machine(),
                "python": platform.python_version(),
                "cpu_count": os.cpu_count(),
                "cpu_percent": psutil.cpu_percent(interval=0),
                "memory_total_gb": round(mem.total / (1024**3), 1),
                "memory_available_gb": round(mem.available / (1024**3), 1),
            }
        except Exception:
            return {
                "hostname": platform.node(),
                "os": "{} {}".format(platform.system(), platform.release()),
                "arch": platform.machine(),
                "python": platform.python_version(),
                "cpu_count": os.cpu_count(),
            }

    def _flush_structured_logs(self, task_id, log_entries, lock):
        """#229: Flush structured log entries via batch API"""
        with lock:
            if not log_entries:
                return
            entries_copy = list(log_entries)
            log_entries.clear()

        url = "{}/tasks/{}/logs/batch".format(self.platform_url, task_id)
        headers = {
            "Content-Type": "application/json",
            "X-Agent-Token": self.token,
        }
        payload = {"entries": entries_copy}
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code != 200:
                logger.warning("Batch log upload failed for task %s: %s", task_id, resp.status_code)
        except Exception as e:
            logger.warning("Batch log upload error for task %s: %s", task_id, e)


    def _build_launch_command(self, script_path, script_params, gpu_count, parallel_mode, eval_type=""):
        """#478 P3 / #484: Build launch command based on GPU config and eval type.

        - Only TRAINING/MODEL_TRAINING + multi-GPU + DDP/FSDP: torchrun
        - Everything else (OPERATOR, MODEL inference, etc.): python3
        """
        params_json = json.dumps(script_params)
        # #487: Defensive None handling
        parallel_mode = parallel_mode or ""
        eval_type = eval_type or ""
        # #484: Only training tasks should use torchrun
        if (gpu_count > 1
                and parallel_mode.upper() in ("DDP", "FSDP")
                and eval_type.upper() in ("TRAINING", "MODEL_TRAINING")):
            port = _find_free_port()
            cmd = [
                "torchrun",
                "--nproc_per_node={}".format(gpu_count),
                "--master_port={}".format(port),
                "--standalone",
                script_path,
                params_json,
            ]
            logger.info("DDP/FSDP training launch: %s", " ".join(cmd))
            return cmd
        cmd = ["python3", script_path, params_json]
        return cmd

    def _run_task(self, task_id, eval_type, params, chip_info=None):
        start_time = time.time()
        logger.info("开始执行任务 %s, 类型=%s, 参数=%s", task_id, eval_type, params)
        try:
            script_name = self._resolve_script(eval_type, params)
            script_path = os.path.join(self.scripts_dir, script_name)
            if not os.path.exists(script_path):
                raise FileNotFoundError("评测脚本不存在: {}".format(script_path))

            metrics_collector = MetricsCollector()
            metrics_collector.start()

            script_params = dict(params)
            # #478 P3: Extract GPU run spec before building script_params
            run_spec = script_params.pop("_run_spec", {}) or {}
            gpu_indices = run_spec.get("gpuIndices", [])
            parallel_mode = run_spec.get("parallelMode", "")
            gpu_count = len(gpu_indices) if gpu_indices else 0

            env = os.environ.copy()
            if gpu_indices:
                # #485: OPERATOR tasks only use 1 GPU for execution, but all slots
                # remain ALLOCATED (Plan-level reservation). Other eval types use all GPUs.
                eval_upper = (eval_type or "").upper()
                if eval_upper == "OPERATOR" and len(gpu_indices) > 1:
                    # Operator benchmarks: expose only the first allocated GPU
                    visible_indices = [sorted(gpu_indices)[0]]
                    cuda_devices = str(visible_indices[0])
                    logger.info("#485: OPERATOR task — using 1 GPU from %d allocated: "
                                "CUDA_VISIBLE_DEVICES=%s (slots %s remain reserved)",
                                len(gpu_indices), cuda_devices,
                                ",".join(str(i) for i in sorted(gpu_indices)))
                else:
                    # MODEL / TRAINING / others: use all allocated GPUs
                    visible_indices = sorted(gpu_indices)
                    cuda_devices = ",".join(str(i) for i in visible_indices)
                    logger.info("GPU 隔离: CUDA_VISIBLE_DEVICES=%s (%d GPUs)",
                                cuda_devices, gpu_count)
                env["CUDA_VISIBLE_DEVICES"] = cuda_devices

            # #240: Inject chip info for GFLOPS utilization calculation
            if chip_info:
                script_params["_chip_info"] = chip_info

            # #478 P3: Inject GPU info into script params
            script_params["_gpu_count"] = gpu_count
            script_params["_gpu_indices"] = gpu_indices
            script_params["_parallel_mode"] = parallel_mode

            cmd = self._build_launch_command(script_path, script_params, gpu_count, parallel_mode, eval_type)

            cmd_str = " ".join(cmd)
            logger.info("执行命令: %s", cmd_str)

            # #229: 上报 SYSTEM 日志（含系统信息）
            sys_info = self._get_system_info()
            sys_log_entries = [{
                "type": "SYSTEM",
                "level": "INFO",
                "message": "Task {} started on {} | {} | {} cores | {:.1f}GB RAM".format(
                    task_id, sys_info.get("hostname", "unknown"),
                    sys_info.get("os", "unknown"),
                    sys_info.get("cpu_count", "?"),
                    sys_info.get("memory_total_gb", 0)),
                "source": "AGENT",
                "context": sys_info,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }]
            # Immediately flush system log
            url = "{}/tasks/{}/logs/batch".format(self.platform_url, task_id)
            headers = {
                "Content-Type": "application/json",
                "X-Agent-Token": self.token,
            }
            try:
                requests.post(url, json={"entries": sys_log_entries}, headers=headers, timeout=10)
            except Exception as e:
                logger.warning("Failed to report system log: %s", e)

            # #229: 使用 Popen 实时读取输出 + 结构化日志上报
            stdout_lines = []
            stderr_lines = []
            # #504: start_new_session=True for process group kill, preexec_fn for resource limits
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=self.project_root,
                env=env,
                start_new_session=True,
                preexec_fn=self._set_task_limits,
            )

            # 结构化日志缓冲
            log_entries = []
            log_entries_lock = threading.Lock()

            # #506: Progress reporter for this task
            progress_reporter = ProgressReporter(task_id, self.platform_url, self.token)

            def read_stream(stream, line_list, is_stderr=False):
                """从 stdout/stderr 读取输出并分类缓冲"""
                for line in iter(stream.readline, ''):
                    line_list.append(line)
                    stripped = line.rstrip('\n\r')
                    if not stripped:
                        continue

                    if is_stderr:
                        log_type = "ERROR"
                        level = "ERROR"
                        metrics = None
                    else:
                        log_type, level, metrics = self._classify_log_line(stripped)

                    # #506: Extract and report progress from stdout
                    if not is_stderr:
                        prog = self._extract_progress(stripped)
                        if prog is not None:
                            progress_reporter.maybe_report(prog)

                    entry = {
                        "type": log_type,
                        "level": level,
                        "message": stripped,
                        "source": "AGENT",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    if metrics:
                        entry["metrics"] = metrics

                    with log_entries_lock:
                        log_entries.append(entry)
                        should_flush = len(log_entries) >= self.LOG_FLUSH_LINES

                    if should_flush:
                        self._flush_structured_logs(task_id, log_entries, log_entries_lock)
                stream.close()

            # #494: 启动后立即上报 progress=1%，防止 Recovery 误判为卡死
            try:
                progress_url = "{}/tasks/{}/progress".format(self.platform_url, task_id)
                requests.post(progress_url, params={"progress": 1},
                              headers={"X-Agent-Token": self.token}, timeout=5)
                logger.info("#494: 上报初始进度 1%% for task %s", task_id)
            except Exception as e:
                logger.warning("#494: Failed to report initial progress for task %s: %s", task_id, e)

            stdout_thread = threading.Thread(target=read_stream, args=(process.stdout, stdout_lines, False), daemon=True)
            stderr_thread = threading.Thread(target=read_stream, args=(process.stderr, stderr_lines, True), daemon=True)
            stdout_thread.start()
            stderr_thread.start()

            # 定期 flush 日志的后台线程
            flush_stop = threading.Event()

            def periodic_flush():
                while not flush_stop.is_set():
                    flush_stop.wait(self.LOG_FLUSH_INTERVAL)
                    if not flush_stop.is_set():
                        self._flush_structured_logs(task_id, log_entries, log_entries_lock)

            flush_thread = threading.Thread(target=periodic_flush, daemon=True)
            flush_thread.start()

            # #504: 动态超时 + 无输出超时 + 进程组 kill
            task_timeout = self._get_timeout(eval_type, params)
            logger.info("任务 %s 超时设置: %ds (type=%s)", task_id, task_timeout, eval_type)

            def _kill_process_group(proc, reason):
                """#504: 杀掉整个进程组，确保子进程也被清理"""
                try:
                    pgid = os.getpgid(proc.pid)
                    os.killpg(pgid, _signal.SIGTERM)
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(pgid, _signal.SIGKILL)
                except (ProcessLookupError, OSError):
                    pass  # 进程已退出
                logger.warning("进程组已终止: %s (pid=%s)", reason, proc.pid)

            # #504: 轮询式等待 — 同时检查总超时和无输出超时
            start_wait = time.time()
            last_output_time = time.time()
            last_line_count = 0
            returncode = None

            while returncode is None:
                try:
                    returncode = process.wait(timeout=2)  # 2 秒轮询间隔
                except subprocess.TimeoutExpired:
                    pass

                elapsed_total = time.time() - start_wait
                current_line_count = len(stdout_lines) + len(stderr_lines)

                # 检测有新输出 → 重置无输出计时器
                if current_line_count > last_line_count:
                    last_output_time = time.time()
                    last_line_count = current_line_count

                no_output_elapsed = time.time() - last_output_time

                # 总超时检查
                if returncode is None and elapsed_total > task_timeout:
                    _kill_process_group(process, "总超时 {}s".format(task_timeout))
                    returncode = -1
                    msg = "Process killed: timeout exceeded ({}s)".format(task_timeout)
                    stderr_lines.append(msg + "\n")
                    with log_entries_lock:
                        log_entries.append({
                            "type": "ERROR", "level": "ERROR",
                            "message": msg, "source": "AGENT",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                    break

                # 无输出超时检查
                if returncode is None and no_output_elapsed > NO_OUTPUT_TIMEOUT:
                    _kill_process_group(process, "无输出超时 {}s".format(NO_OUTPUT_TIMEOUT))
                    returncode = -1
                    msg = "Process killed: no output for {}s (stuck)".format(NO_OUTPUT_TIMEOUT)
                    stderr_lines.append(msg + "\n")
                    with log_entries_lock:
                        log_entries.append({
                            "type": "ERROR", "level": "ERROR",
                            "message": msg, "source": "AGENT",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                    break

            stdout_thread.join(timeout=5)
            stderr_thread.join(timeout=5)
            flush_stop.set()
            flush_thread.join(timeout=5)

            # 最终 flush 剩余日志
            self._flush_structured_logs(task_id, log_entries, log_entries_lock)

            metrics_collector.stop()
            runtime_metrics = metrics_collector.get_summary()

            elapsed = time.time() - start_time
            stdout_text = "".join(stdout_lines)
            stderr_text = "".join(stderr_lines)
            logger.info("任务 %s 执行完成, 耗时 %.1fs, 返回码 %s", task_id, elapsed, returncode)

            # #217: 保存任务日志到本地
            self._save_task_log(task_id, eval_type, params, cmd_str, stdout_text, stderr_text)

            if returncode != 0:
                raise RuntimeError("脚本执行失败 (code={}): {}".format(returncode, stderr_text))

            # Parse eval result: try full stdout first, then extract last JSON object
            eval_result = None
            try:
                eval_result = json.loads(stdout_text.strip())
            except (json.JSONDecodeError, ValueError):
                pass

            if eval_result is None:
                last_json = None
                for line in reversed(stdout_text.strip().splitlines()):
                    line = line.strip()
                    if line.startswith("{"):
                        try:
                            last_json = json.loads(line)
                            break
                        except (json.JSONDecodeError, ValueError):
                            continue
                if last_json and isinstance(last_json, dict):
                    eval_result = last_json
                    logger.info("Extracted JSON from last line of stdout for task %s", task_id)
                else:
                    eval_result = {"raw_output": stdout_text}
                    logger.warning("Could not parse structured JSON from stdout for task %s, using raw_output fallback", task_id)

            # #521: Validate eval output against JSON Schema
            if HAS_EVAL_VALIDATOR and eval_result and "raw_output" not in eval_result:
                try:
                    validate_eval_output(eval_result)
                    logger.info("#521: Eval output for task %s passed schema validation", task_id)
                except EvalValidationError as ve:
                    logger.warning("#521: Eval output for task %s failed schema validation: %s", task_id, ve)
                    no_data = build_no_data_result(stdout_text, str(ve))
                    self._report_result(task_id, "COMPLETED", {
                        "eval_result": no_data,
                        "runtime_metrics": runtime_metrics,
                        "duration_sec": round(elapsed, 2),
                        "node_id": self.node_id,
                    }, logs=stdout_text + "\n" + stderr_text)
                    return  # Skip normal reporting — already reported as NO_DATA

            # #229: 上报 SYSTEM 任务完成摘要日志
            summary_entry = [{
                "type": "SYSTEM",
                "level": "INFO",
                "message": "任务 {} 执行完成，耗时 {:.1f}s，状态: COMPLETED".format(task_id, elapsed),
                "source": "AGENT",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "context": {"node_id": str(self.node_id), "nodeId": str(self.node_id), "duration_sec": round(elapsed, 2)},
            }]
            try:
                url = "{}/tasks/{}/logs/batch".format(self.platform_url, task_id)
                headers = {"Content-Type": "application/json", "X-Agent-Token": self.token}
                requests.post(url, json={"entries": summary_entry}, headers=headers, timeout=10)
            except Exception as se:
                logger.warning("Failed to report SYSTEM summary log: %s", se)

            self._report_result(task_id, "COMPLETED", {
                "eval_result": eval_result,
                "runtime_metrics": runtime_metrics,
                "duration_sec": round(elapsed, 2),
                "node_id": self.node_id,
            }, logs=stdout_text + "\n" + stderr_text)

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error("任务 %s 执行失败: %s", task_id, e)
            # #229: 上报错误日志
            error_entry = [{
                "type": "ERROR",
                "level": "ERROR",
                "message": "Task failed: {}".format(str(e)),
                "source": "AGENT",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }]
            try:
                url = "{}/tasks/{}/logs/batch".format(self.platform_url, task_id)
                headers = {"Content-Type": "application/json", "X-Agent-Token": self.token}
                requests.post(url, json={"entries": error_entry}, headers=headers, timeout=10)
            except Exception:
                pass

            # #229: 上报 SYSTEM 任务失败摘要日志
            fail_summary = [{
                "type": "SYSTEM",
                "level": "ERROR",
                "message": "任务 {} 执行失败，耗时 {:.1f}s，错误: {}".format(task_id, elapsed, str(e)[:200]),
                "source": "AGENT",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "context": {"node_id": str(self.node_id), "nodeId": str(self.node_id), "duration_sec": round(elapsed, 2)},
            }]
            try:
                url = "{}/tasks/{}/logs/batch".format(self.platform_url, task_id)
                headers = {"Content-Type": "application/json", "X-Agent-Token": self.token}
                requests.post(url, json={"entries": fail_summary}, headers=headers, timeout=10)
            except Exception:
                pass

            # #406: 增强错误上报，包含 error_message 字段
            self._report_result(task_id, "FAILED", {
                "error": str(e),
                "error_message": "Agent执行异常: " + str(e)[:500],
                "duration_sec": round(elapsed, 2),
                "node_id": self.node_id,
            })
        finally:
            # #402: 从活跃任务列表中移除
            with self._lock:
                self._active_tasks.pop(task_id, None)
                self._task_info.pop(task_id, None)
            logger.info("任务 %s 资源已释放 (%d/%d workers busy)",
                        task_id, len(self._active_tasks), self.max_workers)
            # #402: 任务完成后立即触发 re-poll（不等下次心跳）
            if self._on_task_complete:
                try:
                    self._on_task_complete()
                except Exception as e:
                    logger.debug("on_task_complete callback error: %s", e)

    def _save_task_log(self, task_id, eval_type, params, cmd_str, stdout_text, stderr_text):
        """#217: 保存任务执行日志到 logs/{taskId}.log"""
        try:
            task_log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
            os.makedirs(task_log_dir, exist_ok=True)
            task_log_path = os.path.join(task_log_dir, "{}.log".format(task_id))
            with open(task_log_path, "w") as f:
                f.write("=== Task {} ===\n".format(task_id))
                f.write("Type: {}\nParams: {}\n".format(eval_type, json.dumps(params, ensure_ascii=False)))
                f.write("Script: {}\n\n".format(cmd_str))
                f.write("=== STDOUT ===\n")
                f.write(stdout_text or "")
                f.write("\n=== STDERR ===\n")
                f.write(stderr_text or "")
            logger.info("任务日志已保存: %s", task_log_path)
        except Exception as e:
            logger.warning("保存任务日志失败: %s", e)

    # #360: 最大重试次数和退避配置
    MAX_REPORT_RETRIES = 3
    REPORT_BACKOFF_BASE = 30  # 秒: 30s, 60s, 120s

    # #507: Error classification — recoverable vs fatal
    RECOVERABLE_ERRORS = ("TimeoutError", "ConnectionError", "OSError", "timeout", "killed", "stuck")
    FATAL_ERRORS = ("FileNotFoundError", "ValueError", "ImportError", "SyntaxError")

    @staticmethod
    def _is_recoverable_error(error_msg):
        """#507: Classify error as recoverable (retryable) or fatal."""
        error_lower = str(error_msg).lower()
        for pattern in TaskExecutor.FATAL_ERRORS:
            if pattern.lower() in error_lower:
                return False
        for pattern in TaskExecutor.RECOVERABLE_ERRORS:
            if pattern.lower() in error_lower:
                return True
        return True  # default: recoverable

    def _report_result(self, task_id, status, result, logs=""):
        """上报执行结果到平台
        #360: 最多重试 3 次，指数退避，4xx 立即停止
        """
        if status == "FAILED":
            url = "{}/tasks/{}/failure".format(self.platform_url, task_id)
        else:
            url = "{}/tasks/{}/result".format(self.platform_url, task_id)
        headers = {
            "Content-Type": "application/json",
            "X-Agent-Token": self.token,
        }
        if status == "FAILED":
            payload = {
                "error": result.get("error", "Unknown error") if isinstance(result, dict) else str(result),
                "logs": logs[-10000:] if logs else "",
            }
        else:
            payload = {
                "status": status,
                "result": result,
                "logs": logs[-10000:] if logs else "",
            }

        for attempt in range(self.MAX_REPORT_RETRIES):
            try:
                resp = requests.post(url, json=payload, headers=headers, timeout=30)
                if resp.status_code == 200:
                    logger.info("任务 %s 结果上报成功, status=%s", task_id, status)
                    self._remove_pending_result(task_id)
                    return
                elif 400 <= resp.status_code < 500:
                    logger.warning("任务 %s 结果上报被拒绝 (HTTP %s): %s，停止重试",
                                   task_id, resp.status_code, resp.text[:200])
                    self._remove_pending_result(task_id)
                    return
                else:
                    logger.error("任务 %s 结果上报失败 (attempt %d/%d): %s %s",
                                 task_id, attempt + 1, self.MAX_REPORT_RETRIES,
                                 resp.status_code, resp.text[:200])
            except Exception as e:
                logger.error("任务 %s 结果上报异常 (attempt %d/%d): %s",
                             task_id, attempt + 1, self.MAX_REPORT_RETRIES, e)

            if attempt < self.MAX_REPORT_RETRIES - 1:
                backoff = self.REPORT_BACKOFF_BASE * (2 ** attempt)
                logger.info("任务 %s 将在 %ds 后重试上报 (attempt %d/%d)",
                            task_id, backoff, attempt + 2, self.MAX_REPORT_RETRIES)
                time.sleep(backoff)

        logger.error("任务 %s 结果上报 %d 次均失败，持久化到本地", task_id, self.MAX_REPORT_RETRIES)
        self._save_pending_result(task_id, payload)

    def _save_pending_result(self, task_id, payload):
        """#216: 上报失败时将结果持久化到本地，等待心跳重传"""
        try:
            os.makedirs(PENDING_DIR, exist_ok=True)
            fpath = os.path.join(PENDING_DIR, "{}.json".format(task_id))
            with open(fpath, "w") as f:
                json.dump(payload, f, ensure_ascii=False)
            logger.info("任务 %s 结果已持久化到 %s，等待重传", task_id, fpath)
        except Exception as e:
            logger.error("持久化任务结果失败: %s", e)

    def _remove_pending_result(self, task_id):
        """#360: 清理本地持久化的结果文件"""
        try:
            fpath = os.path.join(PENDING_DIR, "{}.json".format(task_id))
            if os.path.exists(fpath):
                os.remove(fpath)
                logger.info("已清理本地持久化结果: %s", fpath)
        except Exception as e:
            logger.debug("清理持久化结果失败: %s", e)


class MetricsCollector(threading.Thread):
    """后台采集运行时指标"""

    def __init__(self, interval=2.0):
        super().__init__(daemon=True, name="metrics-collector")
        self.interval = interval
        self._stop_event = threading.Event()
        self.samples = []

    def run(self):
        import psutil
        while not self._stop_event.is_set():
            from collector import get_cpu_sample
            self.samples.append({
                "cpu_percent": get_cpu_sample(),
                "memory_percent": psutil.virtual_memory().percent,
                "timestamp": time.time(),
            })
            self._stop_event.wait(self.interval)

    def stop(self):
        self._stop_event.set()
        self.join(timeout=5)

    def get_summary(self):
        if not self.samples:
            return {}
        cpu_vals = [s["cpu_percent"] for s in self.samples]
        mem_vals = [s["memory_percent"] for s in self.samples]
        return {
            "samples": len(self.samples),
            "cpu_percent_avg": round(sum(cpu_vals) / len(cpu_vals), 1),
            "cpu_percent_max": round(max(cpu_vals), 1),
            "cpu_percent_min": round(min(cpu_vals), 1),
            "memory_percent_avg": round(sum(mem_vals) / len(mem_vals), 1),
            "memory_percent_max": round(max(mem_vals), 1),
        }
