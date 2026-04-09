#!/usr/bin/env python3
"""
AI 硬件验证平台 - 计算节点 Agent
启动流程: 注册 -> 心跳线程 -> Flask HTTP 服务
"""
import logging
import logging.handlers
import os
import sys
import signal
import yaml
import threading
import time
from flask import Flask, jsonify, request
from flask_cors import CORS

# 加载配置
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
with open(CONFIG_PATH, "r") as f:
    config = yaml.safe_load(f)

# 配置日志 - RotatingFileHandler (#217)
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(log_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
file_handler = logging.handlers.RotatingFileHandler(
    os.path.join(log_dir, "agent.log"), maxBytes=10*1024*1024, backupCount=5
)
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(levelname)s - %(message)s"))
logging.getLogger().addHandler(file_handler)

logger = logging.getLogger("agent")

# 导入模块
from register import register_node
from heartbeat import HeartbeatThread
from executor import TaskExecutor
from collector import get_system_metrics

# Flask 应用
app = Flask(__name__)
CORS(app, resources={r"/api/k8s/*": {"origins": "*"}})

# 注册 K8s API 路由
from k8s_routes import k8s_bp
app.register_blueprint(k8s_bp)

# 全局状态
node_info = None
heartbeat_thread = None
executor = None


@app.before_request
def verify_token():
    """请求认证中间件 (#213) - 平台→Agent 通信认证"""
    if request.path == '/status':
        return  # 健康检查不需要认证
    token = request.headers.get('X-Agent-Token')
    if token != config['platform']['token']:
        return jsonify({"code": -1, "message": "认证失败"}), 401


@app.route("/status", methods=["GET"])
def status():
    """返回 Agent 状态"""
    return jsonify({
        "status": "online",
        "node_id": node_info.get("id") if node_info else None,
        "node_name": config["node"]["name"],
        "busy": executor.is_busy if executor else False,
        "current_task": executor.current_task if executor else None,
        "metrics": get_system_metrics(),
    })


@app.route("/execute", methods=["POST"])
def execute():
    """接收并执行评测任务 — #226: 返回 202 Accepted"""
    if executor is None:
        return jsonify({"code": -1, "message": "Agent 未就绪"}), 503

    data = request.get_json()
    if not data:
        return jsonify({"code": -1, "message": "缺少请求体"}), 400

    task_id = data.get("taskId")
    eval_type = data.get("evalType")
    params = data.get("params", {})
    task_config = data.get("config", {})

    if not task_id or not eval_type:
        return jsonify({"code": -1, "message": "缺少 taskId 或 evalType"}), 400

    # Bug #95 fix: 合并 config 到 params（config 为低优先级，params 覆盖 config）
    merged_params = {}
    if isinstance(task_config, dict):
        merged_params.update(task_config)
    if isinstance(params, dict):
        merged_params.update(params)

    logger.info("接收任务 %s, evalType=%s, params=%s, config=%s, merged=%s",
                task_id, eval_type, params, task_config, merged_params)

    if executor.is_busy:
        # #218: 节点忙时返回 409 Conflict
        return jsonify({
            "code": -1,
            "message": "节点忙，正在执行任务 {}".format(executor.current_task),
        }), 409

    try:
        # #240: Extract chip info from dispatch payload
        chip_info = data.get("chip", {})
        executor.execute_async(task_id, eval_type, merged_params, chip_info=chip_info)
        # #226: 返回 202 Accepted（异步执行，结果通过回调上报）
        return jsonify({
            "code": 0,
            "message": "任务 {} 已接受，开始异步执行".format(task_id),
            "data": {"taskId": task_id, "status": "ACCEPTED"},
        }), 202
    except Exception as e:
        logger.error("任务执行失败: %s", e)
        return jsonify({"code": -1, "message": str(e)}), 500


def shutdown_handler(sig, frame):
    """优雅退出"""
    logger.info("收到退出信号，正在关闭...")
    if heartbeat_thread:
        heartbeat_thread.stop()
    sys.exit(0)


def main():
    global node_info, heartbeat_thread, executor

    logger.info("=" * 60)
    logger.info("AI 硬件验证平台 - 计算节点 Agent 启动中...")
    logger.info("平台地址: %s", config["platform"]["url"])
    logger.info("节点名称: %s", config["node"]["name"])
    logger.info("Agent 端口: %s", config["agent"]["port"])
    logger.info("=" * 60)

    # 注册信号处理
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    # 1. 注册节点（带重试）
    node_info = register_node(config, max_retries=5, retry_interval=10)
    if not node_info:
        logger.warning("初始注册失败，以离线模式启动，后台继续重试注册...")
        node_info = {"id": 0, "name": config["node"]["name"]}

    node_id = node_info.get("id", 0)

    # 2. 初始化任务执行器
    executor = TaskExecutor(config, node_id)

    # 3. 启动心跳线程（或后台重试注册线程）
    if node_id > 0:
        heartbeat_thread = HeartbeatThread(node_id, config)
        heartbeat_thread.start()
    else:
        # 后台持续重试注册，成功后自动启动心跳
        def background_register():
            global node_info, heartbeat_thread, executor
            retry_count = 0
            while True:
                retry_count += 1
                wait_time = min(30 * retry_count, 300)  # 30s, 60s, 90s, ... 最大 5 分钟
                logger.info("后台注册重试将在 %d 秒后执行 (第 %d 次)", wait_time, retry_count)
                time.sleep(wait_time)
                result = register_node(config, max_retries=1, retry_interval=0)
                if result:
                    node_info = result
                    new_node_id = result.get("id", 0)
                    if new_node_id > 0:
                        executor.node_id = new_node_id
                        heartbeat_thread = HeartbeatThread(new_node_id, config)
                        heartbeat_thread.start()
                        logger.info("后台注册成功! 节点 ID=%s，心跳已启动", new_node_id)
                        return
                logger.warning("后台注册重试失败 (第 %d 次)，继续重试...", retry_count)

        bg_thread = threading.Thread(target=background_register, daemon=True, name="bg-register")
        bg_thread.start()
        logger.info("后台注册重试线程已启动")

    # 4. 启动 Flask HTTP 服务
    logger.info("启动 HTTP 服务 %s:%s", config["agent"]["host"], config["agent"]["port"])
    app.run(
        host=config["agent"]["host"],
        port=config["agent"]["port"],
        debug=False,
        use_reloader=False,
    )


if __name__ == "__main__":
    main()
