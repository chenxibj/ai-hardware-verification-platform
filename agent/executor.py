"""任务执行模块"""
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

# #216: 上报失败时本地持久化目录
PENDING_DIR = "/tmp/ahvp-pending-results"


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

    def __init__(self, config, node_id):
        self.config = config
        self.node_id = node_id
        self.platform_url = config["platform"]["url"]
        self.token = config["platform"]["token"]
        # #220: 支持相对路径（相对于 agent 目录）
        scripts_dir = config["eval_scripts_dir"]
        if not os.path.isabs(scripts_dir):
            scripts_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), scripts_dir)
        self.scripts_dir = os.path.realpath(scripts_dir)
        # #220: project_root 可选，fallback 到 agent 父目录
        self.project_root = config.get("project_root") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.current_task = None
        self._lock = threading.Lock()

    @property
    def is_busy(self):
        return self.current_task is not None

    def _resolve_script(self, eval_type, params):
        """根据 eval_type 和 params 解析实际要执行的脚本名"""
        # 先统一大小写查找
        script_name = self.SCRIPT_MAP.get(eval_type) or self.SCRIPT_MAP.get(eval_type.upper()) or self.SCRIPT_MAP.get(eval_type.lower())

        # 对于不在 SCRIPT_MAP 中的类型，报错
        if script_name is None and eval_type.upper() != "PERFORMANCE":
            raise ValueError("未知的评测类型: {}".format(eval_type))
        # PERFORMANCE 类型需要动态路由
        if eval_type.upper() == "PERFORMANCE":
            # 如果 config/params 中有 operator 相关参数，走算子 benchmark
            has_operator = any(k in params for k in ("operator", "operators", "op"))
            # 如果有 model 相关参数，走模型推理
            has_model = any(k in params for k in ("model", "models", "batch_sizes", "batch_size"))

            if has_operator and not has_model:
                script_name = "cpu_operator_benchmark.py"
            elif has_model and not has_operator:
                script_name = "cpu_model_inference.py"
            else:
                # 默认走算子 benchmark
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
            # 立即占位，防止并发请求
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
            # 线程启动失败时释放占位
            with self._lock:
                self.current_task = None
            raise

    def _run_task(self, task_id, eval_type, params):
        start_time = time.time()
        logger.info("开始执行任务 %s, 类型=%s, 参数=%s", task_id, eval_type, params)
        try:
            script_name = self._resolve_script(eval_type, params)
            script_path = os.path.join(self.scripts_dir, script_name)

            # #214: 路径穿越校验 — 确保脚本路径在 eval_scripts_dir 内
            real_path = os.path.realpath(script_path)
            if not real_path.startswith(os.path.realpath(self.scripts_dir)):
                raise ValueError("非法脚本路径: {}".format(script_name))

            if not os.path.exists(script_path):
                raise FileNotFoundError("评测脚本不存在: {}".format(script_path))

            metrics_collector = MetricsCollector()
            metrics_collector.start()

            # 构建 CLI 参数：将 params 作为 JSON 传给脚本
            script_params = dict(params)  # 浅拷贝
            cmd = ["python3", script_path]
            if script_params:
                cmd.append(json.dumps(script_params))

            cmd_str = " ".join(cmd)
            logger.info("执行命令: %s", cmd_str)
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
                cwd=self.project_root,
            )

            metrics_collector.stop()
            runtime_metrics = metrics_collector.get_summary()

            elapsed = time.time() - start_time
            logger.info("任务 %s 执行完成, 耗时 %.1fs, 返回码 %s", task_id, elapsed, result.returncode)

            # #217: 保存任务日志
            self._save_task_log(task_id, eval_type, params, cmd_str, result)

            if result.returncode != 0:
                raise RuntimeError("脚本执行失败 (code={}): {}".format(result.returncode, result.stderr))

            try:
                eval_result = json.loads(result.stdout.strip())
            except json.JSONDecodeError:
                eval_result = {"raw_output": result.stdout}

            self._report_result(task_id, "COMPLETED", {
                "eval_result": eval_result,
                "runtime_metrics": runtime_metrics,
                "duration_sec": round(elapsed, 2),
                "node_id": self.node_id,
            }, logs=result.stdout + "\n" + result.stderr)

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error("任务 %s 执行失败: %s", task_id, e)
            self._report_result(task_id, "FAILED", {
                "error": str(e),
                "duration_sec": round(elapsed, 2),
                "node_id": self.node_id,
            })
        finally:
            # Bug #94 fix: 确保无论如何都释放 current_task
            with self._lock:
                self.current_task = None
            logger.info("任务 %s 资源已释放, current_task=None", task_id)

    def _save_task_log(self, task_id, eval_type, params, cmd_str, result):
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
                f.write(result.stdout or "")
                f.write("\n=== STDERR ===\n")
                f.write(result.stderr or "")
            logger.info("任务日志已保存: %s", task_log_path)
        except Exception as e:
            logger.warning("保存任务日志失败: %s", e)

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
                # #216: 上报失败，持久化到本地
                self._save_pending_result(task_id, payload)
        except Exception as e:
            logger.error("任务 %s 结果上报异常: %s", task_id, e)
            # #216: 上报异常，持久化到本地
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
