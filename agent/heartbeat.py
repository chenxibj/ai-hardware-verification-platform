"""心跳上报模块 — #247: 心跳404自动重注册, #400: 自愈能力提升, #402: 批量拉取, #505: 网络隔离+supervisor回调"""
import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
import requests
from collector import get_system_metrics
from register import register_node

logger = logging.getLogger(__name__)

# #216: 上报失败时本地持久化目录
PENDING_DIR = "/tmp/ahvp-pending-results"

# #505: 网络故障隔离 — 缓存结果目录
CACHED_RESULTS_DIR = "/tmp/ahvp-cached-results"


class HeartbeatThread(threading.Thread):
    """后台线程，定期发送心跳
    #400: 连续失败自动重注册 + 线程异常自动重启 + 网络恢复自动恢复
    #402: 非忙时快速 poll、批量拉取
    """

    # #400: 连续心跳失败阈值 -> 自动重注册
    MAX_CONSECUTIVE_FAILURES = 3

    # #402: DISPATCHED 任务快速 poll 间隔
    FAST_POLL_INTERVAL = 10  # 秒

    def __init__(self, node_id, config, executor=None):
        super().__init__(daemon=True, name="heartbeat")
        self.node_id = node_id
        self.config = config
        self.platform_url = config["platform"]["url"]
        self.token = config["platform"]["token"]
        self.interval = config["heartbeat"]["interval"]
        self._stop_event = threading.Event()
        self.executor = executor  # TaskExecutor reference for pull-based dispatch

        # #400: 自愈状态追踪
        self._consecutive_failures = 0
        self._last_success_time = None
        self._lock = threading.Lock()
        # #505: 网络状态追踪
        self._network_state = "connected"  # connected | disconnected
        # #505: supervisor 重启回调
        self._on_restart_callback = None  # main.py 设置的回调
        # #400: 守护线程（监控心跳线程自身）
        self._supervisor_thread = None

    def run(self):
        logger.info("心跳线程启动, 间隔 %ss, 节点 ID=%s (pull-based dispatch, self-healing enabled)",
                     self.interval, self.node_id)
        # #400: 启动守护线程监控自身
        self._start_supervisor()

        while not self._stop_event.is_set():
            try:
                self._send_heartbeat()
                # Pull-based dispatch: 心跳后拉取待执行任务
                # #402: 非忙时连续 poll 直到无任务可拉取
                self._batch_poll_tasks()
                # #216: 每次心跳后尝试重传失败的结果
                self._retry_pending()
            except Exception as e:
                # #400: 心跳循环内的异常不会导致线程退出
                logger.error("心跳循环异常（已捕获，继续运行）: %s", e, exc_info=True)

            # #402: 动态间隔 — 有空闲 worker 且有可能有任务时缩短间隔
            interval = self._get_dynamic_interval()
            self._stop_event.wait(interval)

        logger.info("心跳线程已停止")

    def _get_dynamic_interval(self):
        """#402: 动态调整心跳间隔 — 有空闲 worker 时使用快速 poll"""
        if self.executor and not self.executor.is_full:
            return self.FAST_POLL_INTERVAL
        return self.interval

    def _start_supervisor(self):
        """#400/#505: 启动守护线程 — 如果心跳线程异常退出，自动重启并通知 main.py 更新引用"""
        def supervisor():
            while not self._stop_event.is_set():
                self._stop_event.wait(30)  # 每 30 秒检查一次
                if self._stop_event.is_set():
                    return
                if not self.is_alive():
                    logger.warning("#505: 心跳线程已退出，正在重启...")
                    try:
                        new_hb = HeartbeatThread(self.node_id, self.config, executor=self.executor)
                        new_hb._consecutive_failures = self._consecutive_failures
                        new_hb._last_success_time = self._last_success_time
                        new_hb._network_state = self._network_state
                        if self._on_restart_callback:
                            new_hb.set_restart_callback(self._on_restart_callback)
                        new_hb.start()
                        # #505: 通知 main.py 更新全局引用
                        if self._on_restart_callback:
                            self._on_restart_callback(new_hb)
                        logger.info("#505: 心跳线程已重启")
                        return  # 新线程有自己的 supervisor
                    except Exception as e:
                        logger.error("#505: 心跳线程重启失败: %s", e)

        self._supervisor_thread = threading.Thread(
            target=supervisor, daemon=True, name="heartbeat-supervisor")
        self._supervisor_thread.start()

    def stop(self):
        self._stop_event.set()

    def set_restart_callback(self, callback):
        """#505: 设置 supervisor 重启回调"""
        self._on_restart_callback = callback

    def get_health_info(self):
        """#400: 返回心跳健康信息（给 /health 端点用）"""
        with self._lock:
            return {
                "status": "running" if self.is_alive() else "stopped",
                "consecutive_failures": self._consecutive_failures,
                "last_success_time": self._last_success_time,
                "node_id": self.node_id,
                "interval": self._get_dynamic_interval(),
                "network_state": self._network_state,
            }

    def _send_heartbeat(self):
        try:
            metrics = get_system_metrics()
            url = "{}/nodes/{}/heartbeat".format(self.platform_url, self.node_id)
            headers = {
                "Content-Type": "application/json",
                "X-Agent-Token": self.token,
            }
            resp = requests.post(url, json=metrics, headers=headers, timeout=10)

            # #247: 心跳返回404时自动重注册
            if resp.status_code == 404:
                logger.warning("心跳 404（节点不存在），尝试自动重注册...")
                self._do_re_register()
                return

            if resp.status_code == 200:
                with self._lock:
                    was_disconnected = self._network_state == "disconnected"
                    self._consecutive_failures = 0
                    self._last_success_time = datetime.now(timezone.utc).isoformat()
                    self._network_state = "connected"
                if was_disconnected:
                    logger.info("#505: 网络恢复 DISCONNECTED -> CONNECTED，批量上报缓存结果")
                    self._flush_cached_results()
                logger.debug("心跳发送成功 CPU=%.1f%% MEM=%.1f%%",
                             metrics["cpu_percent"], metrics["memory_used_percent"])
            else:
                self._handle_failure("HTTP {}".format(resp.status_code))
        except requests.exceptions.ConnectionError as e:
            self._handle_failure("连接失败: {}".format(e))
        except requests.exceptions.Timeout:
            self._handle_failure("超时")
        except Exception as e:
            self._handle_failure(str(e))

    def _handle_failure(self, reason):
        """#400: 处理心跳失败 — 累计失败次数，达到阈值自动重注册"""
        with self._lock:
            self._consecutive_failures += 1
            failures = self._consecutive_failures

        logger.warning("心跳发送失败 (%d/%d): %s",
                       failures, self.MAX_CONSECUTIVE_FAILURES, reason)

        if failures >= self.MAX_CONSECUTIVE_FAILURES:
            # #505: 网络断开时暂停拉取新任务
            with self._lock:
                if self._network_state != "disconnected":
                    self._network_state = "disconnected"
                    logger.warning("#505: 网络断开 — 暂停拉取新任务，正在运行的任务继续")
            logger.warning("#400 自愈: 心跳连续失败 %d 次，触发自动重注册...", failures)
            self._do_re_register()

    def _do_re_register(self):
        """#400: 执行自动重注册"""
        try:
            node_info = register_node(self.config, max_retries=3, retry_interval=5)
            if node_info and node_info.get("id"):
                old_id = self.node_id
                self.node_id = node_info["id"]
                # 更新 executor 的 node_id
                if self.executor:
                    self.executor.node_id = node_info["id"]
                with self._lock:
                    self._consecutive_failures = 0
                    self._last_success_time = datetime.now(timezone.utc).isoformat()
                logger.info("#400 自愈: 自动重注册成功，node_id: %s -> %s", old_id, self.node_id)
            else:
                logger.error("#400 自愈: 自动重注册失败，将在下次心跳时重试")
        except Exception as e:
            logger.error("#400 自愈: 重注册异常: %s", e)

    def _batch_poll_tasks(self):
        """#402: 批量拉取任务 — 非忙时连续 poll 直到无任务或 worker 已满"""
        if self.executor is None:
            return

        # #505: 网络故障隔离 — 网络断开时不 poll 新任务
        with self._lock:
            if self._network_state == "disconnected":
                logger.debug("#505: 网络断开，跳过 poll 新任务")
                return

        # 连续 poll，每次拉取可用 worker 数量的任务
        max_rounds = 3  # 最多连续 poll 3 轮，避免无限循环
        for round_num in range(max_rounds):
            available = self.executor.available_workers
            if available <= 0:
                break  # worker 已满

            try:
                url = "{}/nodes/{}/poll-tasks".format(self.platform_url, self.node_id)
                headers = {
                    "Content-Type": "application/json",
                    "X-Agent-Token": self.token,
                }
                # #402: 拉取数量等于可用 worker 数
                resp = requests.post(url, json={"maxTasks": available}, headers=headers, timeout=10)
                if resp.status_code != 200:
                    logger.debug("Poll-tasks returned %s", resp.status_code)
                    break

                data = resp.json()
                # Server returns {code, data: {tasks: [...], cancelTasks: [...]}}
                data_payload = data.get("data", {})
                if isinstance(data_payload, dict):
                    tasks = data_payload.get("tasks", [])
                elif isinstance(data_payload, list):
                    tasks = data_payload
                else:
                    tasks = []
                if not tasks:
                    break  # 没有更多任务

                submitted = 0
                for task_payload in tasks:
                    task_id = task_payload.get("taskId")
                    eval_type = task_payload.get("evalType")
                    params = task_payload.get("params", {})
                    task_config = task_payload.get("config", {})
                    chip_info = task_payload.get("chip", {})

                    if not task_id or not eval_type:
                        logger.warning("Invalid task payload from poll: %s", task_payload)
                        continue

                    if self.executor.is_full:
                        logger.info("Agent worker 已满，停止拉取")
                        break

                    # 合并 config 到 params
                    merged_params = {}
                    if isinstance(task_config, dict):
                        merged_params.update(task_config)
                    if isinstance(params, dict):
                        merged_params.update(params)

                    # #478 P7: 注入 RunSpec 到 merged_params，使 executor 能设置 CUDA_VISIBLE_DEVICES
                    run_spec_data = task_payload.get("runSpec", {})
                    if run_spec_data:
                        merged_params["_run_spec"] = run_spec_data
                        logger.info("注入 RunSpec: gpuIndices=%s, parallelMode=%s",
                                    run_spec_data.get("gpuIndices"), run_spec_data.get("parallelMode"))

                    # #504: 后端传入的 timeout 注入到 params
                    dispatch_timeout = task_payload.get("timeout")
                    if dispatch_timeout:
                        merged_params["_timeout"] = dispatch_timeout

                    logger.info("#402 批量拉取: 接收任务 %s (type=%s), round=%d",
                                task_id, eval_type, round_num + 1)
                    try:
                        self.executor.execute_async(task_id, eval_type, merged_params, chip_info=chip_info)
                        submitted += 1
                        logger.info("#402 批量拉取: 任务 %s 已提交执行 (%d/%d workers busy)",
                                    task_id, self.executor.active_task_count, self.executor.max_workers)
                    except RuntimeError as e:
                        logger.warning("#402 批量拉取: 任务 %s 执行失败: %s", task_id, e)
                        # #443: 通知后端退回任务（RUNNING → QUEUED）
                        try:
                            reject_url = "{}/nodes/{}/reject-task/{}".format(
                                self.platform_url, self.node_id, task_id)
                            requests.post(reject_url, headers=headers,
                                          json={"reason": str(e)}, timeout=5)
                            logger.info("已通知后端退回任务 %s", task_id)
                        except Exception as re:
                            logger.warning("退回任务 %s 通知失败: %s", task_id, re)
                        break

                if submitted == 0:
                    break  # 没有成功提交任何任务，停止 poll

            except requests.exceptions.Timeout:
                logger.debug("Poll-tasks timeout (non-fatal)")
                break
            except Exception as e:
                logger.warning("Poll-tasks error: %s", e)
                break

    def _save_cached_result(self, task_id, payload):
        """#505: 网络断开时缓存任务结果到本地"""
        try:
            os.makedirs(CACHED_RESULTS_DIR, exist_ok=True)
            fpath = os.path.join(CACHED_RESULTS_DIR, "{}.json".format(task_id))
            with open(fpath, "w") as f:
                json.dump(payload, f, ensure_ascii=False)
            logger.info("#505: 任务 %s 结果已缓存到 %s", task_id, fpath)
        except Exception as e:
            logger.error("#505: 缓存任务结果失败: %s", e)

    def _flush_cached_results(self):
        """#505: 网络恢复后批量上报缓存的任务结果"""
        if not os.path.exists(CACHED_RESULTS_DIR):
            return
        headers = {
            "Content-Type": "application/json",
            "X-Agent-Token": self.token,
        }
        flushed = 0
        for fname in os.listdir(CACHED_RESULTS_DIR):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(CACHED_RESULTS_DIR, fname)
            try:
                with open(fpath) as f:
                    payload = json.load(f)
                task_id = fname.replace(".json", "")
                url = "{}/tasks/{}/result".format(self.platform_url, task_id)
                resp = requests.post(url, json=payload, headers=headers, timeout=10)
                if resp.status_code == 200 or (400 <= resp.status_code < 500):
                    os.remove(fpath)
                    flushed += 1
                    logger.info("#505: 缓存结果 %s 上报成功 (HTTP %s)", task_id, resp.status_code)
                else:
                    logger.warning("#505: 缓存结果 %s 上报失败: HTTP %s", task_id, resp.status_code)
            except Exception as e:
                logger.warning("#505: 上报缓存结果 %s 失败: %s", fname, e)
        if flushed > 0:
            logger.info("#505: 批量上报完成，成功 %d 个", flushed)

    # #360: 每个 pending 结果最多重试次数
    MAX_PENDING_RETRIES = 3

    def _retry_pending(self):
        """#216/#360: 重传上报失败的任务结果，最多重试 3 次，4xx 立即放弃"""
        if not os.path.exists(PENDING_DIR):
            return
        headers = {
            "Content-Type": "application/json",
            "X-Agent-Token": self.token,
        }
        for fname in os.listdir(PENDING_DIR):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(PENDING_DIR, fname)
            try:
                with open(fpath) as f:
                    payload = json.load(f)

                # #360: 追踪重试次数
                retry_count = payload.get("_retry_count", 0)
                if retry_count >= self.MAX_PENDING_RETRIES:
                    logger.warning("任务 %s 结果重传已达上限 (%d 次)，放弃并删除",
                                   fname, self.MAX_PENDING_RETRIES)
                    os.remove(fpath)
                    continue

                task_id = fname.replace(".json", "")
                url = "{}/tasks/{}/result".format(self.platform_url, task_id)
                resp = requests.post(url, json=payload, headers=headers, timeout=10)
                if resp.status_code == 200:
                    os.remove(fpath)
                    logger.info("重传任务 %s 结果成功", task_id)
                elif 400 <= resp.status_code < 500:
                    # #360: 4xx 错误（含 410 Gone）-> 停止重试，删除文件
                    logger.warning("任务 %s 结果被服务端拒绝 (HTTP %s)，停止重传并删除",
                                   task_id, resp.status_code)
                    os.remove(fpath)
                else:
                    # 5xx：递增重试计数并保存
                    payload["_retry_count"] = retry_count + 1
                    with open(fpath, "w") as f:
                        json.dump(payload, f, ensure_ascii=False)
                    logger.warning("重传任务 %s 失败 (%d/%d): %s",
                                   task_id, retry_count + 1, self.MAX_PENDING_RETRIES, resp.status_code)
            except Exception as e:
                logger.warning("重传失败: %s", e)
