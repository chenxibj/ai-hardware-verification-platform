#!/usr/bin/env python3
"""
AI 硬件验证平台 - 计算节点 Agent
启动流程: 注册 -> 心跳线程 -> Flask HTTP 服务
#400: 自愈能力提升 — systemd 服务化 + 优雅退出 + 健康检查
#402: 批量拉取任务 — ThreadPoolExecutor 并发执行
#505: 自愈三件套 — 注册失败防护 + 网络隔离 + supervisor 回调
"""
import logging
import logging.handlers
import os
import sys
import signal
import yaml
import threading
import time
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from flask_cors import CORS

# 加载配置
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
with open(CONFIG_PATH, "r") as f:
    config = yaml.safe_load(f)

# #495: 环境变量覆盖 — 支持多节点部署（同一份代码，不同环境变量）
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
    # 存储到 config 中供 register.py 使用，覆盖自动探测的 IP
    config.setdefault("_overrides", {})["ip_address"] = os.environ["AGENT_IP_ADDRESS"]

# 配置日志 - RotatingFileHandler (#217)
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(log_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.handlers.RotatingFileHandler(
            os.path.join(log_dir, "agent.log"), maxBytes=10*1024*1024, backupCount=5
        ),
    ]
)

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
from k8s_routes import start_k8s_heartbeat
start_k8s_heartbeat()


# 全局状态
node_info = None
heartbeat_thread = None
executor = None
# #400: 启动时间 & 优雅退出标志
BOOT_TIME = time.time()
_shutting_down = threading.Event()


@app.before_request
def verify_token():
    """请求认证中间件 (#213/#503) - 平台->Agent 通信认证
    /health 保持匿名（K8s liveness probe），其余所有端点需要 X-Agent-Token"""
    # #503: 仅 /health 免认证
    if request.path == '/health':
        return
    token = request.headers.get('X-Agent-Token')
    if token != config['platform']['token']:
        return jsonify({"code": -1, "message": "认证失败"}), 401


@app.route("/status", methods=["GET"])
def status():
    """#503: 返回最小 Agent 状态，不暴露内部 node_id、config 详情"""
    return jsonify({
        "status": "online",
        "busy": executor.is_busy if executor else False,
        "active_tasks": executor.active_task_count if executor else 0,
        "max_workers": executor.max_workers if executor else 0,
    })


@app.route("/health", methods=["GET"])
def health():
    """#503: 健康检查端点 — 仅返回 status: healthy（K8s liveness probe）"""
    return jsonify({"status": "healthy"})


def _format_uptime(seconds):
    """格式化 uptime 为人类可读"""
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    minutes = int((seconds % 3600) // 60)
    if days > 0:
        return "{}d {}h {}m".format(days, hours, minutes)
    elif hours > 0:
        return "{}h {}m".format(hours, minutes)
    else:
        return "{}m".format(minutes)


@app.route("/execute", methods=["POST"])
def execute():
    """接收并执行评测任务 — #226: 返回 202 Accepted, #402: 支持并发"""
    # #505: 注册未完成时拒绝任务
    if node_info is None or node_info.get("id", 0) == 0:
        return jsonify({
            "code": -1,
            "message": "Agent 注册未完成（node_id=0），无法接收任务，请稍后重试",
            "retryable": True,
        }), 503

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

    # Bug #95 fix: 合并 config 到 params
    merged_params = {}
    if isinstance(task_config, dict):
        merged_params.update(task_config)
    if isinstance(params, dict):
        merged_params.update(params)

    # #478 P7: 注入 RunSpec 到 merged_params，使 executor 能设置 CUDA_VISIBLE_DEVICES
    run_spec_data = data.get("runSpec", {})
    if run_spec_data:
        merged_params["_run_spec"] = run_spec_data
        logger.info("注入 RunSpec: gpuIndices=%s, parallelMode=%s",
                    run_spec_data.get("gpuIndices"), run_spec_data.get("parallelMode"))

    logger.info("接收任务 %s, evalType=%s, params=%s, config=%s, merged=%s",
                task_id, eval_type, params, task_config, merged_params)

    # #402: 检查线程池是否已满（替代原来的 is_busy 单任务检查）
    if executor.is_full:
        return jsonify({
            "code": -1,
            "message": "节点任务已满 ({}/{})".format(
                executor.active_task_count, executor.max_workers),
        }), 409

    try:
        # #240: Extract chip info from dispatch payload
        chip_info = data.get("chip", {})
        executor.execute_async(task_id, eval_type, merged_params, chip_info=chip_info)
        return jsonify({
            "code": 0,
            "message": "任务 {} 已接受，开始异步执行".format(task_id),
            "data": {"taskId": task_id, "status": "ACCEPTED"},
        }), 202
    except Exception as e:
        logger.error("任务执行失败: %s", e)
        return jsonify({"code": -1, "message": str(e)}), 500


def shutdown_handler(sig, frame):
    """#400: 优雅退出 — 捕获 SIGTERM，等待当前任务完成再退出"""
    sig_name = signal.Signals(sig).name if hasattr(signal, 'Signals') else str(sig)
    logger.info("收到退出信号 %s，开始优雅关闭...", sig_name)
    _shutting_down.set()

    # 停止心跳线程
    if heartbeat_thread:
        heartbeat_thread.stop()
        logger.info("心跳线程已停止")

    # 等待当前正在执行的任务完成（最多等 300 秒）
    if executor and executor.active_task_count > 0:
        logger.info("等待 %d 个运行中任务完成...", executor.active_task_count)
        deadline = time.time() + 300
        while executor.active_task_count > 0 and time.time() < deadline:
            remaining = executor.active_task_count
            logger.info("仍有 %d 个任务运行中，等待... (剩余超时 %ds)",
                        remaining, int(deadline - time.time()))
            time.sleep(5)
        if executor.active_task_count > 0:
            logger.warning("超时！仍有 %d 个任务运行中，强制退出", executor.active_task_count)
        else:
            logger.info("所有任务已完成，安全退出")

    # 关闭线程池
    if executor:
        executor.shutdown()

    logger.info("Agent 已关闭")
    sys.exit(0)


def main():
    global node_info, heartbeat_thread, executor

    logger.info("=" * 60)
    logger.info("AI 硬件验证平台 - 计算节点 Agent 启动中...")
    logger.info("#400: 自愈能力 + #402: 批量拉取 已启用")
    logger.info("平台地址: %s", config["platform"]["url"])
    logger.info("节点名称: %s", config["node"]["name"])
    logger.info("Agent 端口: %s", config["agent"]["port"])
    logger.info("=" * 60)

    # 注册信号处理 — #400: 优雅退出
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    # 1. 注册节点（带重试）
    node_info = register_node(config, max_retries=5, retry_interval=10)
    if not node_info:
        logger.warning("初始注册失败，以离线模式启动，后台继续重试注册...")
        node_info = {"id": 0, "name": config["node"]["name"]}

    node_id = node_info.get("id", 0)

    # 2. 初始化任务执行器 — #402: ThreadPoolExecutor (max_workers=4)
    executor = TaskExecutor(config, node_id)

    # 3. 启动心跳线程 — #400: 带自愈能力
    # #402: 任务完成后立即 re-poll
    def _on_task_done():
        if heartbeat_thread:
            try:
                heartbeat_thread._batch_poll_tasks()
            except Exception as e:
                logger.debug('Immediate re-poll failed: %s', e)
    executor.set_on_task_complete(_on_task_done)

    # #505: 心跳重启回调 — supervisor 重启心跳线程时更新全局引用
    def _on_heartbeat_restart(new_hb):
        global heartbeat_thread
        heartbeat_thread = new_hb
        logger.info("#505: 全局心跳线程引用已更新")

    if node_id > 0:
        heartbeat_thread = HeartbeatThread(node_id, config, executor=executor)
        heartbeat_thread.set_restart_callback(_on_heartbeat_restart)
        heartbeat_thread.start()
    else:
        def background_register():
            global node_info, heartbeat_thread, executor
            retry_count = 0
            while not _shutting_down.is_set():
                retry_count += 1
                wait_time = min(30 * retry_count, 300)
                logger.info("后台注册重试将在 %d 秒后执行 (第 %d 次)", wait_time, retry_count)
                _shutting_down.wait(wait_time)
                if _shutting_down.is_set():
                    return
                result = register_node(config, max_retries=1, retry_interval=0)
                if result:
                    node_info = result
                    new_node_id = result.get("id", 0)
                    if new_node_id > 0:
                        executor.node_id = new_node_id
                        heartbeat_thread = HeartbeatThread(new_node_id, config, executor=executor)
                        heartbeat_thread.set_restart_callback(_on_heartbeat_restart)
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
