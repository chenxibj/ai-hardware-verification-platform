"""心跳上报模块"""
import logging
import threading
import time
import requests
from collector import get_system_metrics

logger = logging.getLogger(__name__)


class HeartbeatThread(threading.Thread):
    """后台线程，定期发送心跳"""

    def __init__(self, node_id, config):
        super().__init__(daemon=True, name="heartbeat")
        self.node_id = node_id
        self.platform_url = config["platform"]["url"]
        self.token = config["platform"]["token"]
        self.interval = config["heartbeat"]["interval"]
        self._stop_event = threading.Event()

    def run(self):
        logger.info("心跳线程启动, 间隔 %ss, 节点 ID=%s", self.interval, self.node_id)
        while not self._stop_event.is_set():
            self._send_heartbeat()
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
            if resp.status_code == 200:
                logger.debug("心跳发送成功 CPU=%.1f%% MEM=%.1f%%",
                             metrics["cpu_percent"], metrics["memory_used_percent"])
            else:
                logger.warning("心跳响应异常: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("心跳发送失败: %s", e)
