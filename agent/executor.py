"""任务执行模块 (#225 实时日志 + #226 async)"""
import json
import logging
import os
import subprocess
import threading
import time
from typing import Optional, Dict
import requests
from collector import collect_during_execution

logger = logging.getLogger(__name__)


class TaskExecutor:
    """管理评测任务的执行"""

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

    # #225: 日志上报配置
    LOG_FLUSH_INTERVAL = 5  # 秒
    LOG_FLUSH_LINES = 50    # 行

    def __init__(self, config, node_id):
        self.config = config
        self.node_id = node_id
        self.platform_url = config["platform"]["url"]
        self.token = config["platform"]["token"]
        self.scripts_dir = config["eval_scripts_dir"]
        self.project_root = config["project_root"]
        self.current_task = None
        self._lock = threading.Lock()

    @property
    def is_busy(self):
        return self.current_task is not None

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

    def execute_async(self, task_id, eval_type, params=None):
        """异步执行评测任务"""
        with self._lock:
            if self.current_task is not None:
                raise RuntimeError("节点正在执行任务 {}, 无法接受新任务".format(self.current_task))
            self.current_task = task_id

        try:
            thread = threading.Thread(
                target=self._run_task,
                args=(task_id, eval_type, params or {}),
                daemon=True,
                name="task-{}".format(task_id),
            )
            thread.start()
        except Exception:
            with self._lock:
                self.current_task = None
            raise

    def _run_task(self, task_id, eval_type, params):
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
            cmd = ["python3", script_path]
            if script_params:
                cmd.append(json.dumps(script_params))

            cmd_str = " ".join(cmd)
            logger.info("执行命令: %s", cmd_str)

            # #225: 使用 Popen 实时读取输出 + 流式上报日志
            stdout_lines = []
            stderr_lines = []
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=self.project_root,
            )

            # 启动日志采集线程
            log_buffer = []
            log_buffer_lock = threading.Lock()
            last_flush_time = [time.time()]

            def read_stream(stream, line_list, is_stderr=False):
                """从 stdout/stderr 读取输出并缓冲"""
                for line in iter(stream.readline, ''):
                    line_list.append(line)
                    prefix = "[STDERR] " if is_stderr else ""
                    with log_buffer_lock:
                        log_buffer.append(prefix + line)
                        # 检查是否需要 flush
                        should_flush = (
                            len(log_buffer) >= self.LOG_FLUSH_LINES or
                            time.time() - last_flush_time[0] >= self.LOG_FLUSH_INTERVAL
                        )
                    if should_flush:
                        self._flush_logs(task_id, log_buffer, log_buffer_lock, last_flush_time)
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
                        self._flush_logs(task_id, log_buffer, log_buffer_lock, last_flush_time)

            flush_thread = threading.Thread(target=periodic_flush, daemon=True)
            flush_thread.start()

            # 等待进程完成（超时 600s）
            try:
                returncode = process.wait(timeout=600)
            except subprocess.TimeoutExpired:
                process.kill()
                returncode = -1
                stderr_lines.append("Process killed: timeout exceeded (600s)\n")

            stdout_thread.join(timeout=5)
            stderr_thread.join(timeout=5)
            flush_stop.set()
            flush_thread.join(timeout=5)

            # 最终 flush 剩余日志
            self._flush_logs(task_id, log_buffer, log_buffer_lock, last_flush_time, force=True)

            metrics_collector.stop()
            runtime_metrics = metrics_collector.get_summary()

            elapsed = time.time() - start_time
            stdout_text = "".join(stdout_lines)
            stderr_text = "".join(stderr_lines)
            logger.info("任务 %s 执行完成, 耗时 %.1fs, 返回码 %s", task_id, elapsed, returncode)

            if returncode != 0:
                raise RuntimeError("脚本执行失败 (code={}): {}".format(returncode, stderr_text))

            try:
                eval_result = json.loads(stdout_text.strip())
            except json.JSONDecodeError:
                eval_result = {"raw_output": stdout_text}

            self._report_result(task_id, "COMPLETED", {
                "eval_result": eval_result,
                "runtime_metrics": runtime_metrics,
                "duration_sec": round(elapsed, 2),
                "node_id": self.node_id,
            }, logs=stdout_text + "\n" + stderr_text)

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error("任务 %s 执行失败: %s", task_id, e)
            self._report_result(task_id, "FAILED", {
                "error": str(e),
                "duration_sec": round(elapsed, 2),
                "node_id": self.node_id,
            })
        finally:
            with self._lock:
                self.current_task = None
            logger.info("任务 %s 资源已释放, current_task=None", task_id)

    def _flush_logs(self, task_id, log_buffer, lock, last_flush_time, force=False):
        """#225: 将缓冲的日志上报到平台"""
        with lock:
            if not log_buffer and not force:
                return
            content = "".join(log_buffer)
            log_buffer.clear()
            last_flush_time[0] = time.time()

        if not content:
            return

        url = "{}/tasks/{}/logs".format(self.platform_url, task_id)
        headers = {
            "Content-Type": "application/json",
            "X-Agent-Token": self.token,
        }
        payload = {"content": content}
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code != 200:
                logger.warning("Log upload failed for task %s: %s", task_id, resp.status_code)
        except Exception as e:
            logger.warning("Log upload error for task %s: %s", task_id, e)

    def _report_result(self, task_id, status, result, logs=""):
        """上报执行结果到平台"""
        url = "{}/tasks/{}/result".format(self.platform_url, task_id)
        headers = {
            "Content-Type": "application/json",
            "X-Agent-Token": self.token,
        }
        payload = {
            "status": status,
            "result": result,
            "logs": logs[-10000:] if logs else "",
        }
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=30)
            if resp.status_code == 200:
                logger.info("任务 %s 结果上报成功, status=%s", task_id, status)
            else:
                logger.error("任务 %s 结果上报失败: %s %s", task_id, resp.status_code, resp.text)
        except Exception as e:
            logger.error("任务 %s 结果上报异常: %s", task_id, e)


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
