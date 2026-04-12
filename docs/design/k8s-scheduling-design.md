# K8s 评测调度详细设计

> 版本：v1.0 | 作者：菜菜子 | 日期：2026-04-12
> 从 resource-scheduling-design.md Phase 4 独立拆出，细化 K8s 场景

---

## 一、背景与目标

平台需要支持通过 K8s 集群弹性调度评测任务，与 bare-metal 节点形成互补：

| 维度 | Bare-metal | K8s |
|------|-----------|-----|
| 资源管理 | 手动注册、固定分配 | K8s 动态调度、弹性伸缩 |
| GPU 分配 | 平台 GPU Slot 管理 | nvidia-device-plugin 管理 |
| 多机训练 | 平台自行编排 Agent | Kubeflow/MPI Operator 编排 |
| 故障恢复 | 平台检测 + 重试 | K8s Pod 自动重建 |
| 适用场景 | 独占式高性能评测 | 弹性批量评测、CI/CD |

### 目标

1. K8s 资源池可以独立管理，与 bare-metal 池隔离
2. 单 GPU 评测任务 → 提交 K8s Job
3. 多 GPU 单机评测 → K8s Job + nvidia.com/gpu limit
4. 多机多卡分布式评测 → Kubeflow PyTorchJob
5. 任务完成后自动回报结果
6. GPU 资源配额可控

---

## 二、K8s 集群接入

### 2.1 集群注册

平台已有 `k8s_clusters` 表，扩展字段：

```sql
ALTER TABLE k8s_clusters ADD COLUMN IF NOT EXISTS gpu_plugin VARCHAR(64) DEFAULT 'nvidia-device-plugin';
ALTER TABLE k8s_clusters ADD COLUMN IF NOT EXISTS gpu_resource_key VARCHAR(128) DEFAULT 'nvidia.com/gpu';
ALTER TABLE k8s_clusters ADD COLUMN IF NOT EXISTS has_pytorch_operator BOOLEAN DEFAULT false;
ALTER TABLE k8s_clusters ADD COLUMN IF NOT EXISTS has_mpi_operator BOOLEAN DEFAULT false;
ALTER TABLE k8s_clusters ADD COLUMN IF NOT EXISTS default_namespace VARCHAR(64) DEFAULT 'ahvp-eval';
ALTER TABLE k8s_clusters ADD COLUMN IF NOT EXISTS image_registry VARCHAR(256);  -- 集群可用的镜像仓库
ALTER TABLE k8s_clusters ADD COLUMN IF NOT EXISTS kubeconfig_secret VARCHAR(256);  -- kubeconfig 存储路径
```

### 2.2 集群能力探测

注册集群后自动探测：

```java
public class K8sClusterCapability {
    int totalNodes;
    int gpuNodes;                    // 有 GPU 的节点数
    Map<String, Integer> gpuModels;  // {"NVIDIA L40S": 16, "NVIDIA A100": 8}
    int totalGpu;
    int allocatableGpu;              // K8s 可分配 GPU 数
    boolean hasPyTorchOperator;
    boolean hasMPIOperator;
    String gpuResourceKey;           // 通常是 "nvidia.com/gpu"
    String schedulerVersion;
}
```

探测方法：

```bash
# 查看集群 GPU 资源
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.capacity.nvidia\.com/gpu}{"\n"}{end}'

# 检查 PyTorchJob CRD 是否存在
kubectl get crd pytorchjobs.kubeflow.org 2>/dev/null && echo "HAS_PYTORCH_OPERATOR"

# 检查 MPI Operator
kubectl get crd mpijobs.kubeflow.org 2>/dev/null && echo "HAS_MPI_OPERATOR"

# GPU 型号（需要 nvidia-device-plugin label）
kubectl get nodes -l nvidia.com/gpu.product -o jsonpath='{range .items[*]}{.metadata.labels.nvidia\.com/gpu\.product}{"\n"}{end}'
```

### 2.3 K8s 资源池

```sql
-- K8s 资源池示例
INSERT INTO resource_pools (name, type, chip_model, provider, cluster_id, gpu_per_node, description, capacity, status, scheduling_policy) VALUES
('ACK-L40S 弹性池', 'GPU', 'NVIDIA L40S', 'k8s', 1, 8, 
 'ACK 集群 L40S GPU 节点池', '{"nodes": 2, "gpus": 16}', 'ACTIVE', 'k8s_native'),
('ACK-CPU 弹性池',  'CPU', NULL, 'k8s', 1, 0,
 'ACK 集群 CPU 节点池', '{"nodes": 2, "cpus": 16}', 'ACTIVE', 'k8s_native');
```

K8s 池的特殊属性：
- `scheduling_policy` = `k8s_native`（委托 K8s 调度器）
- 不使用平台的 GPU Slot 管理（由 nvidia-device-plugin 管理）
- 节点数可能动态变化（弹性伸缩）

---

## 三、任务提交模式

### 3.1 单机评测（K8s Job）

适用：算子测试、单模型推理、单机训练

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: ahvp-eval-{taskId}
  namespace: ahvp-eval
  labels:
    app: ahvp-eval
    task-id: "{taskId}"
    plan-id: "{planId}"
    chip-model: "nvidia-l40s"
    eval-type: "OPERATOR"
spec:
  backoffLimit: 2          # 失败重试 2 次
  activeDeadlineSeconds: 3600  # 最大运行 1 小时
  ttlSecondsAfterFinished: 600  # 完成 10 分钟后清理
  template:
    metadata:
      labels:
        app: ahvp-eval
        task-id: "{taskId}"
    spec:
      restartPolicy: Never
      # GPU 节点亲和性（芯片型号约束）
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: nvidia.com/gpu.product
                operator: In
                values:
                - "NVIDIA-L40S"
      containers:
      - name: eval-runner
        image: "{imageRegistry}/ahvp-eval-runner:latest"
        command: ["python3", "/app/run_eval.py"]
        args:
          - "--task-id={taskId}"
          - "--eval-type=OPERATOR"
          - "--callback-url=http://{platformApiHost}/api/tasks/{taskId}/complete"
          - "--config={evalConfigJson}"
        env:
          - name: AHVP_TASK_ID
            value: "{taskId}"
          - name: AHVP_CALLBACK_URL
            value: "http://{platformApiHost}/api/tasks/{taskId}/complete"
          - name: AHVP_AGENT_TOKEN
            value: "{agentToken}"
        resources:
          limits:
            nvidia.com/gpu: 1       # 单卡
            cpu: "4"
            memory: "16Gi"
          requests:
            nvidia.com/gpu: 1
            cpu: "2"
            memory: "8Gi"
        volumeMounts:
          - name: eval-data
            mountPath: /data
      volumes:
        - name: eval-data
          emptyDir: {}
```

### 3.2 单机多卡评测（K8s Job + 多 GPU）

```yaml
# 与单机基本相同，只改 GPU 数量
resources:
  limits:
    nvidia.com/gpu: 4       # 4 卡
    cpu: "16"
    memory: "64Gi"
env:
  - name: CUDA_VISIBLE_DEVICES
    value: "0,1,2,3"        # K8s nvidia-device-plugin 自动设置
  - name: NCCL_SOCKET_IFNAME
    value: "eth0"
```

### 3.3 多机多卡评测（PyTorchJob）

需要集群安装 Kubeflow Training Operator（PyTorchJob CRD）。

```yaml
apiVersion: kubeflow.org/v1
kind: PyTorchJob
metadata:
  name: ahvp-dist-eval-{taskId}
  namespace: ahvp-eval
  labels:
    app: ahvp-eval
    task-id: "{taskId}"
    plan-id: "{planId}"
spec:
  pytorchReplicaSpecs:
    Master:
      replicas: 1
      restartPolicy: Never
      template:
        spec:
          affinity:
            nodeAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                nodeSelectorTerms:
                - matchExpressions:
                  - key: nvidia.com/gpu.product
                    operator: In
                    values: ["NVIDIA-L40S"]
          containers:
          - name: eval-runner
            image: "{imageRegistry}/ahvp-dist-eval-runner:latest"
            command: ["python3", "-m", "torch.distributed.run"]
            args:
              - "--nproc_per_node=8"
              - "/app/run_dist_eval.py"
              - "--task-id={taskId}"
              - "--callback-url=http://{platformApiHost}/api/tasks/{taskId}/complete"
            env:
              - name: AHVP_TASK_ID
                value: "{taskId}"
              - name: NCCL_SOCKET_IFNAME
                value: "eth0"
              - name: NCCL_DEBUG
                value: "WARN"
            resources:
              limits:
                nvidia.com/gpu: 8
                cpu: "32"
                memory: "128Gi"
              requests:
                nvidia.com/gpu: 8
                cpu: "16"
                memory: "64Gi"
            ports:
            - containerPort: 29500
              name: master-port
    Worker:
      replicas: 1            # 2 机 = 1 Master + 1 Worker
      restartPolicy: Never
      template:
        spec:
          affinity:
            nodeAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                nodeSelectorTerms:
                - matchExpressions:
                  - key: nvidia.com/gpu.product
                    operator: In
                    values: ["NVIDIA-L40S"]
          containers:
          - name: eval-runner
            image: "{imageRegistry}/ahvp-dist-eval-runner:latest"
            command: ["python3", "-m", "torch.distributed.run"]
            args:
              - "--nproc_per_node=8"
              - "/app/run_dist_eval.py"
              - "--task-id={taskId}"
            env:
              - name: NCCL_SOCKET_IFNAME
                value: "eth0"
            resources:
              limits:
                nvidia.com/gpu: 8
                cpu: "32"
                memory: "128Gi"
```

### 3.4 不支持 PyTorchJob 时的降级方案

如果集群没有安装 Kubeflow Operator，多机任务使用 **MPI Operator** 或 **多 Job + 手动编排**：

```yaml
# 方案 B：使用原生 Job + init container 做节点发现
# Master Job 先启动，Worker Job 通过 env 注入 Master IP
# 适用于 Kubeflow 不可用的场景
```

---

## 四、结果回报机制

### 4.1 推模式（评测容器主动回报）

评测容器执行完毕后，POST 结果到平台 API：

```python
# eval-runner 容器内
import requests

result = run_evaluation(config)

# 回报结果
requests.post(
    f"{callback_url}",
    json={
        "passed": result.passed,
        "latencyMean": result.latency_mean,
        "latencyP50": result.latency_p50,
        "latencyP95": result.latency_p95,
        "latencyP99": result.latency_p99,
        "throughput": result.throughput,
        "cpuUtil": result.cpu_util,
        "memoryUsed": result.memory_used,
        "gpuUtil": result.gpu_util,
        "gpuMemoryUsed": result.gpu_memory_used,
        "executionNode": os.environ.get("HOSTNAME"),
        "executionGpu": os.environ.get("NVIDIA_VISIBLE_DEVICES")
    },
    headers={"X-Agent-Token": os.environ["AHVP_AGENT_TOKEN"]}
)
```

### 4.2 拉模式（平台监控 Job 状态）

平台后台定时检查 K8s Job/PyTorchJob 状态：

```java
@Scheduled(fixedRate = 15_000)  // 每 15 秒
public void syncK8sTaskStatus() {
    // 查找所有 RUNNING 且 provider=k8s 的任务
    List<EvaluationTask> k8sTasks = taskRepository.findRunningK8sTasks();
    
    for (EvaluationTask task : k8sTasks) {
        K8sJobStatus status = k8sClient.getJobStatus(task.getK8sJobName(), task.getK8sNamespace());
        
        switch (status) {
            case SUCCEEDED -> handleK8sTaskCompleted(task);
            case FAILED -> handleK8sTaskFailed(task, status.reason);
            case RUNNING -> updateHeartbeat(task);
            case PENDING -> {
                // Pod 还在排队（等 GPU 等节点）
                if (Duration.between(task.getStartedAt(), Instant.now()).toMinutes() > 30) {
                    handleK8sTaskTimeout(task, "Pod pending > 30 min, 可能集群 GPU 不足");
                }
            }
        }
    }
}
```

### 4.3 推 + 拉双保险

| 场景 | 推模式 | 拉模式 | 结果 |
|------|--------|--------|------|
| 正常完成 | 容器 POST 结果 ✅ | Job SUCCEEDED → 检查结果已存在 ✅ | 推模式优先 |
| 容器 OOM | POST 没发出去 ❌ | Job FAILED + OOMKilled ✅ | 拉模式兜底 |
| 网络隔离 | POST 超时 ❌ | Job 仍 RUNNING → 等待 | 拉模式超时处理 |
| 平台宕机 | POST 失败 ❌ | 平台恢复后扫描 RUNNING 任务 ✅ | 拉模式恢复 |

---

## 五、GPU 资源配额

### 5.1 Namespace 级配额

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: ahvp-eval-gpu-quota
  namespace: ahvp-eval
spec:
  hard:
    requests.nvidia.com/gpu: "16"  # 最多同时使用 16 张 GPU
    limits.nvidia.com/gpu: "16"
    pods: "32"                      # 最多 32 个 Pod
```

### 5.2 平台层配额

```sql
-- 资源池配额
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS max_gpu_per_task INT;      -- 单任务最大 GPU 数
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS max_gpu_total INT;          -- 池级最大并发 GPU 数
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS max_concurrent_tasks INT;   -- 最大并发任务数
```

平台在提交 Job 前检查配额：

```java
public void checkQuota(ResourcePool pool, RunSpec runSpec) {
    int requestedGpu = runSpec.getNodeCount() * runSpec.getGpuPerNode();
    
    // 检查单任务 GPU 上限
    if (pool.getMaxGpuPerTask() != null && requestedGpu > pool.getMaxGpuPerTask()) {
        throw new QuotaExceededException("单任务 GPU 超限: 请求 " + requestedGpu 
            + "，上限 " + pool.getMaxGpuPerTask());
    }
    
    // 检查池级并发 GPU 上限
    int currentUsed = taskRepository.countAllocatedGpuInPool(pool.getId());
    if (pool.getMaxGpuTotal() != null && currentUsed + requestedGpu > pool.getMaxGpuTotal()) {
        throw new QuotaExceededException("资源池 GPU 并发超限: 当前已用 " + currentUsed
            + "，请求 " + requestedGpu + "，上限 " + pool.getMaxGpuTotal());
    }
}
```

---

## 六、Pod 异常处理

| Pod 状态 | 检测方式 | 平台处理 |
|----------|---------|---------|
| **Pending（GPU 不足）** | `pod.status.conditions: PodScheduled=False` + `Insufficient nvidia.com/gpu` | 任务状态 QUEUED + 原因"K8s 集群 GPU 不足" |
| **Pending（镜像拉取）** | `pod.status.containerStatuses[0].waiting.reason: ImagePullBackOff` | 等待 5 分钟后 FAILED + "镜像拉取失败" |
| **OOMKilled** | `pod.status.containerStatuses[0].state.terminated.reason: OOMKilled` | FAILED + "内存不足（OOMKilled）" |
| **Evicted** | `pod.status.reason: Evicted` | 自动重试（backoffLimit 内）或 FAILED |
| **Node 故障** | Pod 被驱逐到其他节点 | K8s 自动处理（如果 backoffLimit 允许）|
| **GPU 错误** | `nvidia-smi` 报 XID error | FAILED + "GPU 硬件错误"，标记节点 ERROR |

---

## 七、评测镜像管理

### 7.1 镜像策略

```
ahvp-eval-runner:latest         # 单机评测 runner（含 PyTorch/ONNX 等）
ahvp-dist-eval-runner:latest    # 分布式评测 runner（含 DeepSpeed/NCCL）
ahvp-operator-bench:latest      # 算子 benchmark 专用
```

### 7.2 镜像构建

```dockerfile
# Dockerfile.eval-runner
FROM nvidia/cuda:12.4-runtime-ubuntu22.04

RUN pip install torch==2.8.0 onnxruntime-gpu transformers datasets
RUN pip install deepspeed  # 分布式用

COPY eval_scripts/ /app/
COPY agent/ /app/agent/

ENTRYPOINT ["python3", "/app/run_eval.py"]
```

### 7.3 镜像仓库

- ACK 集群内使用 `registry-vpc.cn-beijing.aliyuncs.com/ahvp/` 前缀
- 每个集群在注册时配置 `image_registry`
- 镜像版本与平台版本同步更新

---

## 八、K8s 资源池与 Bare-metal 资源池的报告合并

当同一个评测计划分别在 K8s 和 bare-metal 上执行时，报告需要标注来源：

```json
{
  "executionEnvironment": {
    "provider": "k8s",
    "clusterName": "ahvp-k8s",
    "namespace": "ahvp-eval",
    "podName": "ahvp-eval-12345-xxxxx",
    "nodeName": "ack-node-01",
    "gpuModel": "NVIDIA L40S",
    "gpuCount": 1,
    "k8sGpuPlugin": "nvidia-device-plugin-v0.14"
  }
}
```

对比报告中明确标注：
```
| 指标 | bare-metal (gpu-l40s-01) | K8s (ack-node-01) | 差异 |
|------|-------------------------|-------------------|------|
| MatMul 延迟 | 1.04 ms | 1.12 ms | +7.7% |
| 说明 | 独占节点 | 共享节点，可能有干扰 | |
```

---

## 九、实施计划

### Phase 4a：K8s 单机评测（2 周）
- [ ] 集群能力探测 API
- [ ] K8s Job 模板生成
- [ ] Job 提交 + 状态同步
- [ ] 推 + 拉双通道结果回报
- [ ] 评测镜像构建 + 推送到 ACR
- [ ] GPU 节点亲和性（nodeSelector / nodeAffinity）
- [ ] Pod 异常检测 + 处理
- [ ] Namespace 级 ResourceQuota

### Phase 4b：K8s 多机评测（2 周）
- [ ] PyTorchJob/MPI Operator 检测
- [ ] PyTorchJob YAML 生成
- [ ] Master/Worker 协调
- [ ] 分布式任务状态聚合
- [ ] 降级方案（无 PyTorchJob 时用多 Job 编排）

### Phase 4c：弹性伸缩与高级功能（1 周）
- [ ] 自动创建/销毁 K8s 节点（Cluster Autoscaler 集成）
- [ ] 预测性扩缩（根据任务队列长度提前扩容）
- [ ] 多集群调度（任务在多个 K8s 集群间调度）
- [ ] Spot/抢占式实例支持

---

## 十、与主设计文档的关系

本文档是 `resource-scheduling-design.md` Phase 4 的细化设计。

| 主文档覆盖 | 本文档细化 |
|-----------|-----------|
| K8s 池概念 | K8s 集群注册 + 能力探测 |
| "K8s Job 提交" 一句话 | 完整 Job/PyTorchJob YAML 模板 |
| "结果回调" | 推 + 拉双通道 + Pod 异常处理 |
| 未涉及 | GPU 资源配额、镜像管理、多集群 |
