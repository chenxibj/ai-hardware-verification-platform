"""任务执行模块 (#225 实时日志 + #226 async + #229 结构化日志 + #243 LogReporter)
#402: ThreadPoolExecutor 并发执行多任务"""
import json
import logging
import os
import platform
import re
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor as _ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional, Dict, List
import requests
from collector import collect_during_execution
try:
    from log_reporter import LogReporter
    HAS_LOG_REPORTER = True
except ImportError:
    HAS_LOG_REPORTER = False

logger = logging.getLogger(__name__)

# #216: 上报失败时本地持久化目录
PENDING_DIR = "/tmp/ahvp-pending-results"


class TaskExecutor:
    """管理评测任务的执行 — #402: 支持并发执行多个任务"""

    SCRIPT_MAP = {
        # 具体类型
        "OPERATOR_BENCHMARK": "cpu_operator_benchmark.py",
        "MODEL_INFERENCE": "cpu_model_inference.py",
        "operator_benchmark": "cpu_operator_benchmark.py",
        "model_inference": "cpu_model_inference.py",
        # 简写类型（后端 evalType 字段值）
        "OPERATOR": "cpu_operator_benchmark.py",
        "MODEL": "cpu_model_inference.py",
        "operator": "cpu_operator_benchmark.py",
        "model": "cpu_model_inference.py",
        # 通用 PERFORMANCE 类型 — 运行时根据 config 动态路由
        "PERFORMANCE": None,
        "performance": None,
    }

    # #225/#229: 日志上报配置
    LOG_FLUSH_INTERVAL = 5  # 秒
    LOG_FLUSH_LINES = 50    # 行

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

    def _resolve_script(self, eval_type, params):
        """根据 eval_type 和 params 解析实际要执行的脚本名"""
        script_name = self.SCRIPT_MAP.get(eval_type) or self.SCRIPT_MAP.get(eval_type.upper()) or self.SCRIPT_MAP.get(eval_type.lower())

        if script_name is None and eval_type.upper() != "PERFORMANCE":
            raise ValueError("未知的评测类型: {}".format(eval_type))
        if eval_type.upper() == "PERFORMANCE":
            has_operator = any(k in params for k in ("operator", "operators", "op"))
            has_model = any(k in params for k in ("model", "models", "batch_sizes", "batch_size"))
            if has_operator and not has_model:
                script_name = "cpu_operator_benchmark.py"
            elif has_model and not has_operator:
                script_name = "cpu_model_inference.py"
            else:
                script_name = "cpu_operator_benchmark.py"
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
            # #240: Inject chip info for GFLOPS utilization calculation
            if chip_info:
                script_params["_chip_info"] = chip_info
            cmd = ["python3", script_path]
            if script_params:
                cmd.append(json.dumps(script_params))

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
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=self.project_root,
            )

            # 结构化日志缓冲
            log_entries = []
            log_entries_lock = threading.Lock()

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

            # 等待进程完成（超时 600s）
            try:
                returncode = process.wait(timeout=600)
            except subprocess.TimeoutExpired:
                process.kill()
                returncode = -1
                stderr_lines.append("Process killed: timeout exceeded (600s)\n")
                with log_entries_lock:
                    log_entries.append({
                        "type": "ERROR",
                        "level": "ERROR",
                        "message": "Process killed: timeout exceeded (600s)",
                        "source": "AGENT",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

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
            self.samples.append({
                "cpu_percent": psutil.cpu_percent(interval=0),
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
