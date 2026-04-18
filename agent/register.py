import socket
import json
"""节点注册模块 - 支持重试 + GPU 上报 (#478)"""
import logging
import time
from typing import Optional
import requests
from collector import get_hardware_info, get_gpu_info_detailed

logger = logging.getLogger("register")


def register_node(config, max_retries=5, retry_interval=10):
    # type: (dict, int, int) -> Optional[dict]
    """向平台注册节点，失败自动重试 max_retries 次，每次间隔 retry_interval 秒"""
    platform_url = config["platform"]["url"]
    token = config["platform"]["token"]
    node_cfg = config["node"]

    hardware = get_hardware_info()

    # #478: GPU 探测
    gpu_info = get_gpu_info_detailed()
    hardware["gpu_count"] = gpu_info["gpu_count"]
    hardware["gpus"] = gpu_info["gpus"]
    if gpu_info["gpus"]:
        hardware["gpu_name"] = gpu_info["gpus"][0]["name"]  # backward compat

    # Auto-detect local IP for registration
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"
    
    payload = {
        "name": node_cfg["name"],
        "ipAddress": local_ip,
        "description": node_cfg.get("description", ""),
        "tags": node_cfg.get("tags", ""),
        "agentPort": config["agent"]["port"],
        "hardwareInfo": json.dumps(hardware),
        "gpuCount": gpu_info["gpu_count"],       # #478: top-level GPU count
        "gpuDetails": gpu_info["gpus"],           # #478: detailed GPU list
    }
    headers = {
        "Content-Type": "application/json",
        "X-Agent-Token": token,
    }
    url = platform_url + "/nodes/register"

    for attempt in range(1, max_retries + 1):
        logger.info("正在注册节点到 %s ... (尝试 %d/%d) [gpuCount=%d]",
                     url, attempt, max_retries, gpu_info["gpu_count"])
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") == 0:
                node_data = data["data"]
                logger.info("节点注册成功! ID=%s, Name=%s, GPUs=%d",
                            node_data.get("id"), node_data.get("name"), gpu_info["gpu_count"])
                return node_data
            else:
                logger.error("注册失败 (尝试 %d/%d): %s", attempt, max_retries, data)
        except Exception as e:
            logger.error("注册请求异常 (尝试 %d/%d): %s", attempt, max_retries, e)

        if attempt < max_retries:
            logger.info("等待 %d 秒后重试...", retry_interval)
            time.sleep(retry_interval)

    logger.error("注册失败，已重试 %d 次", max_retries)
    return None
