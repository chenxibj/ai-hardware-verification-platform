"""
Agent LogReporter — 结构化日志上报 (#243)
支持 with 语句、自动批量 flush、batchId 幂等
"""
import json
import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import requests

logger = logging.getLogger(__name__)


class LogReporter:
    """
    用法:
        with LogReporter(platform_url, token, task_id) as log:
            log.info("评测开始")
            log.metric("warmup完成", metrics={"warmup_ms": 123})
            log.progress("完成 5/10")
            log.error("出错了")
    """

    FLUSH_SIZE = 10       # 攒够 10 条 auto flush
    FLUSH_INTERVAL = 2.0  # 超过 2 秒 auto flush

    def __init__(
        self,
        platform_url: str,
        token: str,
        task_id: int,
        plan_id: Optional[int] = None,
        node_id: Optional[str] = None,
        source: str = "AGENT",
    ):
        self.platform_url = platform_url.rstrip("/")
        self.token = token
        self.task_id = task_id
        self.plan_id = plan_id
        self.node_id = node_id
        self.source = source

        self._buffer = []
        self._lock = threading.Lock()
        self._flush_stop = threading.Event()
        self._flush_thread: Optional[threading.Thread] = None
        self._batch_counter = 0

    # ── context manager ──

    def __enter__(self):
        self._start_flush_thread()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._flush_stop.set()
        if self._flush_thread:
            self._flush_thread.join(timeout=5)
        self.flush()  # 最终 flush
        return False

    # ── public API ──

    def log(
        self,
        level: str,
        message: str,
        log_type: str = "TEXT",
        metrics: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
    ):
        entry = {
            "level": level,
            "message": message,
            "logType": log_type,
            "source": self.source,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if metrics:
            entry["metrics"] = metrics
        if context:
            entry["context"] = context
        if self.plan_id is not None:
            entry["planId"] = self.plan_id
        if self.node_id is not None:
            entry["nodeId"] = self.node_id

        with self._lock:
            self._buffer.append(entry)
            should_flush = len(self._buffer) >= self.FLUSH_SIZE

        if should_flush:
            self.flush()

    def info(self, message: str, log_type: str = "TEXT", **kwargs):
        self.log("INFO", message, log_type, **kwargs)

    def warn(self, message: str, log_type: str = "TEXT", **kwargs):
        self.log("WARN", message, log_type, **kwargs)

    def error(self, message: str, log_type: str = "TEXT", **kwargs):
        self.log("ERROR", message, log_type, **kwargs)

    def metric(self, message: str, metrics: Dict[str, Any], **kwargs):
        self.log("INFO", message, "METRIC", metrics=metrics, **kwargs)

    def progress(self, message: str, **kwargs):
        self.log("INFO", message, "PROGRESS", **kwargs)

    def system(self, message: str, context: Optional[Dict[str, Any]] = None, **kwargs):
        self.log("INFO", message, "SYSTEM", context=context, **kwargs)

    def flush(self):
        """发送缓冲区日志到后端 batch API，带 batchId 幂等"""
        with self._lock:
            if not self._buffer:
                return
            entries = list(self._buffer)
            self._buffer.clear()
            self._batch_counter += 1
            batch_id = f"lr-{self.task_id}-{self._batch_counter}-{uuid.uuid4().hex[:8]}"

        url = f"{self.platform_url}/tasks/{self.task_id}/logs/batch"
        headers = {
            "Content-Type": "application/json",
            "X-Agent-Token": self.token,
        }
        payload = {
            "batchId": batch_id,
            "logs": entries,
        }

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code == 200:
                logger.debug("LogReporter: flushed %d entries (batch=%s)", len(entries), batch_id)
            else:
                logger.warning(
                    "LogReporter: flush failed status=%s body=%s",
                    resp.status_code,
                    resp.text[:200],
                )
        except Exception as e:
            logger.warning("LogReporter: flush error: %s", e)
            # 失败时放回 buffer 以便重试
            with self._lock:
                self._buffer = entries + self._buffer

    # ── internal ──

    def _start_flush_thread(self):
        def _periodic():
            while not self._flush_stop.is_set():
                self._flush_stop.wait(self.FLUSH_INTERVAL)
                if not self._flush_stop.is_set():
                    self.flush()

        self._flush_thread = threading.Thread(target=_periodic, daemon=True, name="log-reporter-flush")
        self._flush_thread.start()
