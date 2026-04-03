"""节点注册模块"""
import logging
from typing import Optional
import requests
from collector import get_hardware_info

logger = logging.getLogger(__name__)


def register_node(config):
    # type: (dict) -> Optional[dict]
    """向平台注册节点，返回注册后的节点信息（含 node_id）"""
    platform_url = config["platform"]["url"]
    token = config["platform"]["token"]
    node_cfg = config["node"]

    hardware = get_hardware_info()
    payload = {
        "name": node_cfg["name"],
        "description": node_cfg.get("description", ""),
        "tags": node_cfg.get("tags", ""),
        "agentPort": config["agent"]["port"],
        "hardwareInfo": hardware,
    }
    headers = {
        "Content-Type": "application/json",
        "X-Agent-Token": token,
    }
    url = platform_url + "/nodes/register"
    logger.info("正在注册节点到 %s ...", url)
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") == 0:
            node_data = data["data"]
            logger.info("节点注册成功! ID=%s, Name=%s", node_data.get("id"), node_data.get("name"))
            return node_data
        else:
            logger.error("注册失败: %s", data)
            return None
    except Exception as e:
        logger.error("注册请求异常: %s", e)
        return None
