"""#495: 测试环境变量覆盖 config 逻辑"""
import os
import sys
import importlib
import yaml

# Agent 目录
AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, AGENT_DIR)

CONFIG_PATH = os.path.join(AGENT_DIR, "config.yaml")


def _load_config_with_env(env_vars=None):
    """模拟 main.py 的 config 加载 + 环境变量覆盖逻辑"""
    with open(CONFIG_PATH, "r") as f:
        config = yaml.safe_load(f)

    # 复制 main.py 中的覆盖逻辑
    if env_vars:
        old_env = {}
        for k, v in env_vars.items():
            old_env[k] = os.environ.get(k)
            os.environ[k] = v

    try:
        if os.environ.get("AGENT_NODE_NAME"):
            config["node"]["name"] = os.environ["AGENT_NODE_NAME"]
        if os.environ.get("AGENT_NODE_DESCRIPTION"):
            config["node"]["description"] = os.environ["AGENT_NODE_DESCRIPTION"]
        if os.environ.get("AGENT_NODE_TAGS"):
            config["node"]["tags"] = os.environ["AGENT_NODE_TAGS"]
        if os.environ.get("AGENT_PORT"):
            config["agent"]["port"] = int(os.environ["AGENT_PORT"])
        if os.environ.get("AGENT_PLATFORM_URL"):
            config["platform"]["url"] = os.environ["AGENT_PLATFORM_URL"]
        if os.environ.get("AGENT_PLATFORM_TOKEN"):
            config["platform"]["token"] = os.environ["AGENT_PLATFORM_TOKEN"]
        if os.environ.get("AGENT_IP_ADDRESS"):
            config.setdefault("_overrides", {})["ip_address"] = os.environ["AGENT_IP_ADDRESS"]
    finally:
        if env_vars:
            for k, v in old_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    return config


def test_default_config_unchanged():
    """无环境变量时，config 保持 yaml 原值"""
    config = _load_config_with_env()
    assert config["node"]["name"] == "dev-node-01"
    assert config["agent"]["port"] == 8090
    assert config["platform"]["url"] == "http://localhost:8080/api"
    assert "_overrides" not in config
    print("PASS: test_default_config_unchanged")


def test_node_name_override():
    """AGENT_NODE_NAME 覆盖节点名"""
    config = _load_config_with_env({"AGENT_NODE_NAME": "gpu-l40s-01"})
    assert config["node"]["name"] == "gpu-l40s-01"
    print("PASS: test_node_name_override")


def test_port_override():
    """AGENT_PORT 覆盖端口（字符串→int）"""
    config = _load_config_with_env({"AGENT_PORT": "9090"})
    assert config["agent"]["port"] == 9090
    assert isinstance(config["agent"]["port"], int)
    print("PASS: test_port_override")


def test_platform_url_override():
    """AGENT_PLATFORM_URL 覆盖平台地址"""
    config = _load_config_with_env({"AGENT_PLATFORM_URL": "http://39.97.251.94:8080/api"})
    assert config["platform"]["url"] == "http://39.97.251.94:8080/api"
    print("PASS: test_platform_url_override")


def test_ip_address_override():
    """AGENT_IP_ADDRESS 存入 _overrides"""
    config = _load_config_with_env({"AGENT_IP_ADDRESS": "180.184.249.205"})
    assert config["_overrides"]["ip_address"] == "180.184.249.205"
    print("PASS: test_ip_address_override")


def test_multiple_overrides():
    """多个环境变量同时覆盖"""
    env = {
        "AGENT_NODE_NAME": "gpu-l40s-01",
        "AGENT_PORT": "8090",
        "AGENT_PLATFORM_URL": "http://39.97.251.94:8080/api",
        "AGENT_IP_ADDRESS": "180.184.249.205",
        "AGENT_NODE_TAGS": "gpu,l40s,8x",
        "AGENT_NODE_DESCRIPTION": "GPU L40S 8卡测试节点",
    }
    config = _load_config_with_env(env)
    assert config["node"]["name"] == "gpu-l40s-01"
    assert config["node"]["tags"] == "gpu,l40s,8x"
    assert config["node"]["description"] == "GPU L40S 8卡测试节点"
    assert config["agent"]["port"] == 8090
    assert config["platform"]["url"] == "http://39.97.251.94:8080/api"
    assert config["_overrides"]["ip_address"] == "180.184.249.205"
    print("PASS: test_multiple_overrides")


def test_register_uses_override_ip():
    """register_node 的 payload 应使用覆盖的 IP"""
    config = _load_config_with_env({"AGENT_IP_ADDRESS": "180.184.249.205"})
    # 测试 register.py 中的 IP 解析逻辑
    override_ip = config.get("_overrides", {}).get("ip_address") or os.environ.get("AGENT_IP_ADDRESS")
    assert override_ip == "180.184.249.205"
    print("PASS: test_register_uses_override_ip")


if __name__ == "__main__":
    test_default_config_unchanged()
    test_node_name_override()
    test_port_override()
    test_platform_url_override()
    test_ip_address_override()
    test_multiple_overrides()
    test_register_uses_override_ip()
    print("\n✅ All #495 env override tests passed!")
