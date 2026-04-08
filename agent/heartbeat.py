"""心跳上报模块 — #247: 心跳404自动重注册"""
import json
import logging
import os
import threading
import time
import requests
from collector import get_system_metrics
from register import register_node

logger = logging.getLogger(__name__)

# #216: 上报失败时本地持久化目录
PENDING_DIR = "/tmp/ahvp-pending-results"


class HeartbeatThread(threading.Thread):
    """后台线程，定期发送心跳"""

    def __init__(self, node_id, config):
        super().__init__(daemon=True, name="heartbeat")
        self.node_id = node_id
        self.config = config
        self.platform_url = config["platform"]["url"]
        self.token = config["platform"]["token"]
        self.interval = config["heartbeat"]["interval"]
        self._stop_event = threading.Event()

    def run(self):
        logger.info("心跳线程启动, 间隔 %ss, 节点 ID=%s", self.interval, self.node_id)
        while not self._stop_event.is_set():
            self._send_heartbeat()
            # #216: 每次心跳后尝试重传失败的结果
            self._retry_pending()
            self._stop_event.wait(self.interval)

    def stop(self):
        self._stop_event.set()

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
                node_info = register_node(self.config)
                if node_info and node_info.get("id"):
                    self.node_id = node_info["id"]
                    logger.info("自动重注册成功，新 node_id=%s", self.node_id)
                else:
                    logger.error("自动重注册失败，将在下次心跳时重试")
                return

            if resp.status_code == 200:
                logger.debug("心跳发送成功 CPU=%.1f%% MEM=%.1f%%",
                             metrics["cpu_percent"], metrics["memory_used_percent"])
            else:
                logger.warning("心跳响应异常: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("心跳发送失败: %s", e)

    def _retry_pending(self):
        """#216: 重传上报失败的任务结果"""
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
                task_id = fname.replace(".json", "")
                url = "{}/tasks/{}/result".format(self.platform_url, task_id)
                resp = requests.post(url, json=payload, headers=headers, timeout=10)
                if resp.status_code == 200:
                    os.remove(fpath)
                    logger.info("重传任务 %s 结果成功", task_id)
                else:
                    logger.warning("重传任务 %s 失败: %s %s", task_id, resp.status_code, resp.text)
            except Exception as e:
                logger.warning("重传失败: %s", e)
