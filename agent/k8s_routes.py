"""
K8s API 端点 — 统一资源纳管流程
提供 K8s 集群信息查询、节点列表、kubeconfig 验证、Agent 部署等接口
"""
import logging
import os
import tempfile
import json
from flask import Blueprint, jsonify, request

logger = logging.getLogger("agent.k8s")

k8s_bp = Blueprint("k8s", __name__, url_prefix="/api/k8s")

KUBECONFIG_PATH = "/root/.kube/config"


# #507: Global cached K8s clients (initialized once)
_k8s_core_v1 = None
_k8s_version_api = None
_k8s_apps_v1 = None
_k8s_init_done = False


def _init_k8s_global():
    """#507: Initialize K8s clients once at module level (lazy)."""
    global _k8s_core_v1, _k8s_version_api, _k8s_apps_v1, _k8s_init_done
    if _k8s_init_done:
        return
    try:
        from kubernetes import client, config as k8s_config
        k8s_config.load_kube_config(config_file=KUBECONFIG_PATH)
        _k8s_core_v1 = client.CoreV1Api()
        _k8s_version_api = client.VersionApi()
        _k8s_apps_v1 = client.AppsV1Api()
        _k8s_init_done = True
        logger.info("#507: K8s clients initialized globally")
    except Exception as e:
        logger.debug("K8s global init failed (will retry per request): %s", e)


def _load_k8s_clients(kubeconfig_path=None):
    """加载 kubernetes 客户端，返回 (core_v1, version_api, apps_v1)
    #507: 使用全局缓存（默认 kubeconfig），自定义路径时重新加载"""
    if kubeconfig_path is None or kubeconfig_path == KUBECONFIG_PATH:
        _init_k8s_global()
        if _k8s_init_done:
            return _k8s_core_v1, _k8s_version_api, _k8s_apps_v1
    from kubernetes import client, config as k8s_config
    path = kubeconfig_path or KUBECONFIG_PATH
    k8s_config.load_kube_config(config_file=path)
    return client.CoreV1Api(), client.VersionApi(), client.AppsV1Api()


def _node_to_dict(n):
    """将 K8s Node 对象转为字典"""
    ip = next(
        (a.address for a in n.status.addresses if a.type == "InternalIP"), ""
    )
    ready = next(
        (c.status for c in n.status.conditions if c.type == "Ready"),
        "Unknown",
    )
    cpu_cap = n.status.capacity.get("cpu", "0")
    mem_cap = n.status.capacity.get("memory", "0")
    return {
        "name": n.metadata.name,
        "ip": ip,
        "ready": str(ready),
        "cpu": cpu_cap,
        "memory": mem_cap,
        "os": n.status.node_info.os_image,
        "arch": n.status.node_info.architecture,
        "kubelet": n.status.node_info.kubelet_version,
        "containerRuntime": n.status.node_info.container_runtime_version,
        "labels": dict(n.metadata.labels or {}),
        "creationTimestamp": (
            n.metadata.creation_timestamp.isoformat()
            if n.metadata.creation_timestamp
            else None
        ),
    }


@k8s_bp.route("/cluster-info", methods=["GET"])
def cluster_info():
    """获取当前 kubeconfig 指向集群的信息"""
    try:
        core_v1, version_api, _ = _load_k8s_clients()
        ver = version_api.get_code()
        nodes = core_v1.list_node()
        return jsonify({
            "code": 0,
            "data": {
                "cluster": {
                    "version": ver.git_version,
                    "platform": ver.platform,
                    "nodeCount": len(nodes.items),
                    "goVersion": ver.go_version,
                },
                "nodes": [_node_to_dict(n) for n in nodes.items],
            },
        })
    except Exception as e:
        logger.error("获取集群信息失败: %s", e)
        return jsonify({"code": -1, "message": str(e)}), 500


@k8s_bp.route("/nodes", methods=["GET"])
def list_nodes():
    """返回集群节点列表"""
    try:
        core_v1, _, _ = _load_k8s_clients()
        nodes = core_v1.list_node()
        return jsonify({
            "code": 0,
            "data": [_node_to_dict(n) for n in nodes.items],
        })
    except Exception as e:
        logger.error("获取节点列表失败: %s", e)
        return jsonify({"code": -1, "message": str(e)}), 500


@k8s_bp.route("/validate", methods=["POST"])
def validate_kubeconfig():
    """验证用户提供的 kubeconfig，返回集群信息"""
    body = request.get_json(silent=True) or {}
    kubeconfig_content = body.get("kubeconfig", "")
    if not kubeconfig_content:
        return jsonify({"code": -1, "message": "缺少 kubeconfig 内容"}), 400

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as tmp:
            tmp.write(kubeconfig_content)
            tmp_path = tmp.name

        core_v1, version_api, _ = _load_k8s_clients(tmp_path)
        ver = version_api.get_code()
        nodes = core_v1.list_node()
        return jsonify({
            "code": 0,
            "data": {
                "cluster": {
                    "version": ver.git_version,
                    "platform": ver.platform,
                    "nodeCount": len(nodes.items),
                    "goVersion": ver.go_version,
                },
                "nodes": [_node_to_dict(n) for n in nodes.items],
            },
        })
    except Exception as e:
        logger.error("kubeconfig 验证失败: %s", e)
        return jsonify({"code": -1, "message": str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@k8s_bp.route("/deploy-agent", methods=["POST"])
def deploy_agent():
    """在 K8s 集群中部署 AHVP Agent DaemonSet"""
    body = request.get_json(silent=True) or {}
    cluster_name = body.get("clusterName", "ahvp-cluster")
    namespace = body.get("namespace", "ahvp-system")
    platform_url = body.get("platformUrl", "http://39.97.251.94:8080")

    try:
        core_v1, _, apps_v1 = _load_k8s_clients()

        # 1. 创建 namespace（忽略已存在）
        try:
            from kubernetes import client
            ns = client.V1Namespace(
                metadata=client.V1ObjectMeta(
                    name=namespace,
                    labels={"app": "ahvp-agent"},
                )
            )
            core_v1.create_namespace(body=ns)
            logger.info("命名空间 %s 已创建", namespace)
        except Exception as ns_err:
            if "AlreadyExists" in str(ns_err):
                logger.info("命名空间 %s 已存在", namespace)
            else:
                raise

        # 2. 创建 ServiceAccount
        try:
            from kubernetes import client
            sa = client.V1ServiceAccount(
                metadata=client.V1ObjectMeta(
                    name="ahvp-agent", namespace=namespace
                )
            )
            core_v1.create_namespaced_service_account(
                namespace=namespace, body=sa
            )
        except Exception as sa_err:
            if "AlreadyExists" not in str(sa_err):
                raise

        # 3. 创建/更新 DaemonSet
        from kubernetes import client

        container = client.V1Container(
            name="agent",
            image="registry.cn-shanghai.aliyuncs.com/ahvp/agent:latest",
            env=[
                client.V1EnvVar(
                    name="AHVP_SERVER_URL", value=platform_url
                ),
                client.V1EnvVar(
                    name="AHVP_CLUSTER_NAME", value=cluster_name
                ),
                client.V1EnvVar(
                    name="NODE_NAME",
                    value_from=client.V1EnvVarSource(
                        field_ref=client.V1ObjectFieldSelector(
                            field_path="spec.nodeName"
                        )
                    ),
                ),
            ],
            resources=client.V1ResourceRequirements(
                requests={"cpu": "100m", "memory": "128Mi"},
                limits={"cpu": "500m", "memory": "512Mi"},
            ),
        )

        template = client.V1PodTemplateSpec(
            metadata=client.V1ObjectMeta(
                labels={"app": "ahvp-agent"}
            ),
            spec=client.V1PodSpec(
                service_account_name="ahvp-agent",
                host_network=True,
                containers=[container],
                tolerations=[
                    client.V1Toleration(operator="Exists")
                ],
            ),
        )

        ds_spec = client.V1DaemonSetSpec(
            selector=client.V1LabelSelector(
                match_labels={"app": "ahvp-agent"}
            ),
            template=template,
        )

        ds = client.V1DaemonSet(
            metadata=client.V1ObjectMeta(
                name="ahvp-agent",
                namespace=namespace,
                labels={"app": "ahvp-agent"},
            ),
            spec=ds_spec,
        )

        try:
            apps_v1.create_namespaced_daemon_set(
                namespace=namespace, body=ds
            )
            logger.info("DaemonSet ahvp-agent 已创建")
            action = "created"
        except Exception as ds_err:
            if "AlreadyExists" in str(ds_err):
                apps_v1.replace_namespaced_daemon_set(
                    name="ahvp-agent", namespace=namespace, body=ds
                )
                logger.info("DaemonSet ahvp-agent 已更新")
                action = "updated"
            else:
                raise

        return jsonify({
            "code": 0,
            "data": {
                "action": action,
                "namespace": namespace,
                "clusterName": cluster_name,
            },
        })
    except Exception as e:
        logger.error("部署 Agent 失败: %s", e)
        return jsonify({"code": -1, "message": str(e)}), 500


@k8s_bp.route("/register-nodes", methods=["POST"])
def register_k8s_nodes():
    """将 K8s 节点注册到平台节点列表"""
    import requests as req_lib

    body = request.get_json(silent=True) or {}
    cluster_name = body.get("clusterName", "ack-cluster")
    platform_url = body.get("platformUrl", "http://localhost:8080/api")
    platform_token = body.get("platformToken", os.environ.get("AGENT_TOKEN", "changeme-on-deploy"))

    try:
        core_v1, version_api, _ = _load_k8s_clients()
        nodes = core_v1.list_node()
        ver = version_api.get_code()
        registered = []

        for n in nodes.items:
            node_data = _node_to_dict(n)
            # 向平台注册节点
            reg_payload = {
                "name": "k8s-{}-{}".format(
                    cluster_name, node_data["name"]
                ),
                "ip": node_data["ip"],
                "port": 8090,
                "tags": json.dumps([
                    {"key": "source", "value": "k8s"},
                    {"key": "cluster", "value": cluster_name},
                    {"key": "k8s-version", "value": ver.git_version},
                    {"key": "os", "value": node_data["os"]},
                    {"key": "arch", "value": node_data["arch"]},
                    {"key": "type", "value": "CPU"},
                ]),
                "description": "K8s 节点 {} (集群: {})".format(
                    node_data["name"], cluster_name
                ),
            }

            try:
                resp = req_lib.post(
                    "{}/nodes".format(platform_url),
                    json=reg_payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": "Bearer admin-token",
                    },
                    timeout=10,
                )
                registered.append({
                    "node": node_data["name"],
                    "status": "ok" if resp.status_code < 400 else "error",
                    "response": resp.json() if resp.status_code < 400 else resp.text,
                })
            except Exception as reg_err:
                registered.append({
                    "node": node_data["name"],
                    "status": "error",
                    "response": str(reg_err),
                })

        return jsonify({"code": 0, "data": {"registered": registered}})
    except Exception as e:
        logger.error("注册 K8s 节点失败: %s", e)
        return jsonify({"code": -1, "message": str(e)}), 500


def _get_k8s_node_metrics():
    """#506: Get real K8s node CPU metrics via kubectl top nodes.
    Returns cpuUsage percentage or None on failure."""
    try:
        import subprocess as _sp
        result = _sp.run(
            ["kubectl", "top", "nodes", "--no-headers"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        for line in result.stdout.strip().split("\n"):
            parts = line.split()
            if len(parts) >= 3:
                cpu_str = parts[2].strip().rstrip("%")
                try:
                    return float(cpu_str)
                except (ValueError, TypeError):
                    pass
        return None
    except Exception as e:
        logger.debug("kubectl top nodes failed: %s", e)
        return None


# === K8s 节点心跳代理 ===
import threading
import time
import requests as http_requests

PLATFORM_URL = os.environ.get("AHVP_PLATFORM_URL", "http://39.97.251.94/api")
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "changeme-on-deploy")
K8S_NODE_ID = None  # 注册后填入

def _register_k8s_node():
    """注册 K8s 节点到平台，返回 node_id"""
    global K8S_NODE_ID
    try:
        v1, ver_api, _ = _load_k8s_clients()
        nodes = v1.list_node()
        if not nodes.items:
            return None
        n = nodes.items[0]
        ip = next((a.address for a in n.status.addresses if a.type == "InternalIP"), "")
        data = {
            "name": "k8s-node-01",
            "ip": ip,
            "port": 8090,
            "description": f"ACK K8s node - {n.status.node_info.os_image}",
            "tags": "k8s,ack,cn-beijing",
            "capabilities": {
                "cpu": n.status.capacity.get("cpu", "0"),
                "memory": n.status.capacity.get("memory", "0"),
                "k8s": True,
                "kubelet": n.status.node_info.kubelet_version,
            }
        }
        resp = http_requests.post(
            f"{PLATFORM_URL}/nodes/register",
            json=data,
            headers={"Content-Type": "application/json", "X-Agent-Token": AGENT_TOKEN},
            timeout=10
        )
        if resp.status_code == 200:
            result = resp.json()
            node_data = result.get("data", result)
            K8S_NODE_ID = node_data.get("id")
            logger.info(f"K8s node registered: id={K8S_NODE_ID}")
            return K8S_NODE_ID
    except Exception as e:
        logger.error(f"K8s node registration failed: {e}")
    return None

def _k8s_heartbeat_loop():
    """定期为 K8s 节点代理发送心跳"""
    global K8S_NODE_ID
    # 先注册
    for _ in range(5):
        if _register_k8s_node():
            break
        time.sleep(10)
    
    while True:
        try:
            if not K8S_NODE_ID:
                _register_k8s_node()
                time.sleep(30)
                continue
            
            v1, _, _ = _load_k8s_clients()
            nodes = v1.list_node()
            if nodes.items:
                n = nodes.items[0]
                cpu_cap = n.status.capacity.get("cpu", "0")
                mem_cap = n.status.capacity.get("memory", "0")
                ready = any(c.type == "Ready" and c.status == "True" for c in n.status.conditions)
                
                k8s_cpu = _get_k8s_node_metrics()
                metrics = {
                    "cpuUsage": k8s_cpu,  # #506: real metrics from kubectl top
                    "memoryUsage": 30.0,
                    "diskUsage": 20.0,
                    "gpuUsage": 0.0,
                    "status": "ONLINE" if ready else "OFFLINE",
                    "k8sInfo": {
                        "cpu": cpu_cap,
                        "memory": mem_cap,
                        "ready": ready,
                        "kubelet": n.status.node_info.kubelet_version,
                    }
                }
                resp = http_requests.post(
                    f"{PLATFORM_URL}/nodes/{K8S_NODE_ID}/heartbeat",
                    json=metrics,
                    headers={"Content-Type": "application/json", "X-Agent-Token": AGENT_TOKEN},
                    timeout=10
                )
                if resp.status_code == 404:
                    logger.warning("K8s node heartbeat 404, re-registering...")
                    K8S_NODE_ID = None
                    _register_k8s_node()
                else:
                    logger.info(f"K8s heartbeat sent: node_id={K8S_NODE_ID}, status={resp.status_code}")
        except Exception as e:
            logger.error(f"K8s heartbeat error: {e}")
        time.sleep(30)

def start_k8s_heartbeat():
    """启动 K8s 心跳代理线程"""
    t = threading.Thread(target=_k8s_heartbeat_loop, daemon=True)
    t.start()
    logger.info("K8s heartbeat proxy started (30s interval)")
