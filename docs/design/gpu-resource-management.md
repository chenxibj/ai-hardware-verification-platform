# GPU 芯片级资源管理与调度 — 设计方案

## 背景与目标

当前平台 GPU 节点（如 L40S x8）已注册但缺少芯片级资源管理：GPU 总数未上报、Slot 未自动初始化、评测脚本不支持多卡并行、任务排队状态不透明。

### 目标

1. **评测任务按规格分配 GPU 芯片** — 任务根据 RunSpec 声明的 gpuPerNode 数量，精确分配指定数量的 GPU 卡
2. **芯片不足时任务排队，状态实时可查** — QUEUED 任务可查看队列位置、等待原因、预估等待时间
3. **训练和推理脚本支持多卡** — 多卡推理（DataParallel）、多卡训练（DDP + torchrun），参考社区最佳实践

## 现状分析

### 已有基础

| 组件 | 状态 | 说明 |
|------|------|------|
| `gpu_slots` 表 | ✅ 已建 | GpuSlot entity，node_id + gpu_index 唯一约束 |
| `GpuSlotService` | ✅ 已实现 | 分配（悲观锁）、释放、孤儿回收（5分钟定时） |
| `RunSpec` | ✅ 已有 | gpuPerNode、nodeCount、parallelMode、gpuExclusive |
| `TaskDispatcher` GPU 预检 | ✅ 已有 | 空闲 Slot 不够时设 QUEUED + queueReason |
| gpuIndices 下发 | ✅ 已有 | 分发 payload 已包含分配的 GPU 编号 |

### 缺失环节

| 环节 | 问题 | 影响 |
|------|------|------|
| **GPU 总数上报** | Agent 注册/心跳不上报 gpu_count | gpu_slots 表为空（L40S x8 = 0 条记录） |
| **Slot 自动初始化** | 无代码根据上报数据创建 Slot | 调度器 totalSlots=0，GPU 预检逻辑被跳过 |
| **GPU 隔离** | Agent 不设 CUDA_VISIBLE_DEVICES | 多任务同节点会争抢同一张卡 |
| **多卡并行** | 评测脚本只用 cuda:0 | 8 卡节点只用 1 卡，资源浪费 |
| **排队信息** | 前端看不到队列位置和预估时间 | 用户不知道还要等多久 |

## 架构总览

```
Agent 节点                              平台后端                         前端
┌─────────────────┐                ┌──────────────────┐          ┌──────────────┐
│ 注册时:          │ ──register──>  │ 接收 gpu_count   │          │              │
│  nvidia-smi 探测 │                │ 自动初始化       │          │ 节点详情     │
│  gpu_count       │                │ gpu_slots 行     │          │  └ GPU Slot  │
│  gpu_models[]    │                │                  │          │    实时状态   │
│  gpu_memory[]    │                │                  │          │              │
├─────────────────┤                ├──────────────────┤          │ 任务列表     │
│ 心跳时:          │ ──heartbeat──> │ 更新 gpu_slots   │          │  └ 排队位置  │
│  per-gpu 利用率  │                │ 状态/温度/显存    │          │  └ 等待原因  │
│  gpu_memory_used │                │                  │          │  └ 预估时间  │
│  gpu_temperature │                │                  │          │              │
│  gpu_power       │                │                  │          │ GPU 总览面板 │
├─────────────────┤                ├──────────────────┤          │  └ 全局利用率│
│ 执行任务时:      │                │ TaskDispatcher:  │          └──────────────┘
│  CUDA_VISIBLE_   │ <──dispatch──  │  gpu_slots 分配  │
│  DEVICES=0,1     │                │  连续卡优选      │
│  torchrun        │                │  排队+原因       │
│  (多卡并行)      │                │  自动回收        │
└─────────────────┘                └──────────────────┘
```

## 详细设计

### 模块 1: Agent GPU 探测与上报

**改动文件:** `agent/collector.py`, `agent/register.py`, `agent/heartbeat.py`

#### 1.1 GPU 详细信息采集

`collector.py` 新增 `get_gpu_info_detailed()`:

```python
def get_gpu_info_detailed():
    """通过 nvidia-smi + torch.cuda 探测 GPU 详细信息
    
    返回示例:
    {
        "gpu_count": 8,
        "gpus": [
            {
                "index": 0,
                "name": "NVIDIA L40S",
                "memory_total_mb": 46068,
                "memory_used_mb": 1024,
                "memory_free_mb": 45044,
                "temperature_c": 42,
                "power_draw_w": 75.5,
                "utilization_gpu_percent": 30,
                "utilization_memory_percent": 5,
            },
            ...
        ]
    }
    """
    gpus = []
    try:
        import subprocess
        # nvidia-smi 一次性查所有字段
        result = subprocess.run(
            ['nvidia-smi',
             '--query-gpu=index,name,memory.total,memory.used,memory.free,'
             'temperature.gpu,power.draw,utilization.gpu,utilization.memory',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split('\n'):
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 9:
                    gpus.append({
                        "index": int(parts[0]),
                        "name": parts[1],
                        "memory_total_mb": int(float(parts[2])),
                        "memory_used_mb": int(float(parts[3])),
                        "memory_free_mb": int(float(parts[4])),
                        "temperature_c": _safe_int(parts[5]),
                        "power_draw_w": _safe_float(parts[6]),
                        "utilization_gpu_percent": _safe_int(parts[7]),
                        "utilization_memory_percent": _safe_int(parts[8]),
                    })
    except FileNotFoundError:
        pass  # 无 nvidia-smi（CPU 节点）
    except Exception as e:
        logger.warning("nvidia-smi 探测失败: %s", e)

    # fallback: torch.cuda（无 nvidia-smi 但有 CUDA 环境时）
    if not gpus:
        try:
            import torch
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                gpus.append({
                    "index": i,
                    "name": props.name,
                    "memory_total_mb": props.total_mem // 1048576,
                    "memory_used_mb": None,
                    "memory_free_mb": None,
                    "temperature_c": None,
                    "power_draw_w": None,
                    "utilization_gpu_percent": None,
                    "utilization_memory_percent": None,
                })
        except Exception:
            pass

    return {
        "gpu_count": len(gpus),
        "gpus": gpus,
    }


def _safe_int(s):
    try: return int(float(s))
    except: return None

def _safe_float(s):
    try: return float(s)
    except: return None
```

#### 1.2 注册时上报

`register.py` — 注册 payload 增加 GPU 信息:

```python
from collector import get_hardware_info, get_gpu_info_detailed

def register_node(config, ...):
    hardware = get_hardware_info()
    gpu_info = get_gpu_info_detailed()

    # 合并 GPU 信息到 hardwareInfo
    hardware["gpu_count"] = gpu_info["gpu_count"]
    hardware["gpus"] = gpu_info["gpus"]
    if gpu_info["gpus"]:
        hardware["gpu_name"] = gpu_info["gpus"][0]["name"]  # 向后兼容

    payload = {
        "name": node_cfg["name"],
        "ipAddress": local_ip,
        "hardwareInfo": json.dumps(hardware),
        "gpuCount": gpu_info["gpu_count"],    # 顶层字段，后端直接读
        "gpuDetails": gpu_info["gpus"],       # 详细列表
        ...
    }
```

#### 1.3 心跳时上报实时 GPU 指标

`heartbeat.py` / `collector.py` — 心跳 metrics 增加 per-GPU 实时数据:

```python
def get_system_metrics():
    metrics = { ... }  # 现有 CPU/MEM/DISK 指标

    # GPU 实时指标（每次心跳都上报）
    gpu_info = get_gpu_info_detailed()
    metrics["gpu_count"] = gpu_info["gpu_count"]
    metrics["gpus"] = gpu_info["gpus"]

    return metrics
```

### 模块 2: 后端 GPU Slot 自动初始化

**改动文件:** `GpuSlotService.java`, `ComputeNodeService.java`

#### 2.1 Slot 同步逻辑

```java
// GpuSlotService.java 新增

/**
 * 根据 Agent 上报的 GPU 信息，同步 gpu_slots 表
 * 触发时机：节点注册 + 心跳中检测到 gpu_count 变化
 *
 * 策略：
 * - gpu_count 匹配 → 只更新元信息（型号/显存）
 * - gpu_count 不匹配 → 增量同步（不删 ALLOCATED 状态的 slot）
 */
@Transactional
public void syncGpuSlots(Long nodeId, int gpuCount, List<Map<String, Object>> gpuDetails) {
    List<GpuSlot> existing = gpuSlotRepository.findByNodeIdOrderByGpuIndex(nodeId);
    
    if (existing.size() == gpuCount && gpuCount > 0) {
        // 数量一致，更新元信息
        for (GpuSlot slot : existing) {
            Map<String, Object> detail = findGpuByIndex(gpuDetails, slot.getGpuIndex());
            if (detail != null) {
                slot.setGpuModel((String) detail.get("name"));
                Integer memMb = (Integer) detail.get("memory_total_mb");
                if (memMb != null) slot.setGpuMemoryGb(memMb / 1024);
            }
        }
        gpuSlotRepository.saveAll(existing);
        return;
    }
    
    if (gpuCount == 0) return;  // CPU 节点，不管
    
    // 增量同步：保留 ALLOCATED，补齐缺失的 index
    Set<Integer> existingIndices = existing.stream()
        .map(GpuSlot::getGpuIndex).collect(Collectors.toSet());
    
    // 删除多余的 FREE slot（缩容场景）
    for (GpuSlot slot : existing) {
        if (slot.getGpuIndex() >= gpuCount && "FREE".equals(slot.getStatus())) {
            gpuSlotRepository.delete(slot);
        }
    }
    
    // 创建缺失的 slot
    for (int i = 0; i < gpuCount; i++) {
        if (existingIndices.contains(i)) continue;
        GpuSlot slot = new GpuSlot();
        slot.setNodeId(nodeId);
        slot.setGpuIndex(i);
        Map<String, Object> detail = findGpuByIndex(gpuDetails, i);
        if (detail != null) {
            slot.setGpuModel((String) detail.get("name"));
            Integer memMb = (Integer) detail.get("memory_total_mb");
            if (memMb != null) slot.setGpuMemoryGb(memMb / 1024);
        }
        slot.setStatus("FREE");
        gpuSlotRepository.save(slot);
    }
    
    log.info("Synced GPU slots for node {}: {} slots (was {})", 
             nodeId, gpuCount, existing.size());
}

private Map<String, Object> findGpuByIndex(List<Map<String, Object>> gpus, int index) {
    if (gpus == null) return null;
    return gpus.stream()
        .filter(g -> Integer.valueOf(index).equals(g.get("index")))
        .findFirst().orElse(null);
}
```

#### 2.2 触发入口

```java
// ComputeNodeService.java

@Transactional
public ComputeNode register(ComputeNode node) {
    // ... 现有注册逻辑 ...
    ComputeNode saved = repo.save(node);
    
    // 自动初始化 GPU Slots
    syncGpuSlotsFromHardwareInfo(saved);
    return saved;
}

public void processHeartbeat(Long nodeId, Map<String, Object> metrics) {
    // ... 现有心跳处理 ...
    
    // 检查 gpu_count 是否变化
    Integer reportedGpuCount = (Integer) metrics.get("gpu_count");
    if (reportedGpuCount != null && reportedGpuCount > 0) {
        ComputeNode node = repo.findById(nodeId).orElse(null);
        if (node != null && !reportedGpuCount.equals(node.getGpuCount())) {
            node.setGpuCount(reportedGpuCount);
            repo.save(node);
            List<Map<String, Object>> gpus = (List) metrics.get("gpus");
            gpuSlotService.syncGpuSlots(nodeId, reportedGpuCount, gpus);
        }
    }
}

private void syncGpuSlotsFromHardwareInfo(ComputeNode node) {
    try {
        if (node.getHardwareInfo() == null) return;
        JsonNode root = objectMapper.readTree(node.getHardwareInfo());
        int gpuCount = root.has("gpu_count") ? root.get("gpu_count").asInt() : 0;
        if (gpuCount <= 0) return;
        
        List<Map<String, Object>> gpuDetails = new ArrayList<>();
        if (root.has("gpus") && root.get("gpus").isArray()) {
            for (JsonNode gpu : root.get("gpus")) {
                Map<String, Object> detail = objectMapper.convertValue(gpu, Map.class);
                gpuDetails.add(detail);
            }
        }
        
        node.setGpuCount(gpuCount);
        gpuSlotService.syncGpuSlots(node.getId(), gpuCount, gpuDetails);
    } catch (Exception e) {
        log.warn("Failed to sync GPU slots for node {}: {}", node.getId(), e.getMessage());
    }
}
```

### 模块 3: 任务排队增强

**改动文件:** `EvaluationTask.java`, `TaskDispatcher.java`, `EvaluationTaskController.java`

#### 3.1 Entity 新增字段

```java
// EvaluationTask.java 新增
@Column(name = "queue_position")
private Integer queuePosition;

@Column(name = "estimated_wait_minutes")
private Integer estimatedWaitMinutes;

@Column(name = "allocated_gpu_indices", length = 200)
private String allocatedGpuIndices;  // JSON: "[0,1,2,3]"
```

#### 3.2 排队位置实时计算

```java
// TaskDispatcher.java 新增

/**
 * 更新所有 QUEUED 任务的排队位置和预估等待时间
 * 在每次调度循环结束后调用
 */
private void refreshQueuePositions() {
    List<EvaluationTask> queuedTasks = taskRepository
        .findQueuedTasksOrderByPriorityAndCreatedAt();
    
    // 计算平均任务完成耗时（最近 50 个已完成任务）
    Double avgDurationSec = taskRepository.findAverageCompletedDurationSeconds();
    double avgMin = (avgDurationSec != null) ? avgDurationSec / 60.0 : 10.0; // 默认 10 分钟
    
    for (int i = 0; i < queuedTasks.size(); i++) {
        EvaluationTask task = queuedTasks.get(i);
        task.setQueuePosition(i + 1);
        task.setEstimatedWaitMinutes((int) Math.ceil(avgMin * (i + 1)));
        taskRepository.save(task);
    }
}
```

#### 3.3 队列查询 API

```java
// EvaluationTaskController.java 新增

/**
 * 查询排队中的任务列表（含位置和预估等待时间）
 */
@GetMapping("/tasks/queue")
public ApiResponse<List<Map<String, Object>>> getTaskQueue() {
    List<EvaluationTask> queued = taskRepository
        .findQueuedTasksOrderByPriorityAndCreatedAt();
    
    List<Map<String, Object>> result = queued.stream().map(t -> {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("taskId", t.getId());
        item.put("taskNo", t.getTaskNo());
        item.put("evalType", t.getEvalType());
        item.put("queuePosition", t.getQueuePosition());
        item.put("estimatedWaitMinutes", t.getEstimatedWaitMinutes());
        item.put("queueReason", t.getQueueReason());
        item.put("gpuNeeded", resolveGpuNeeded(t));
        item.put("createdAt", t.getCreatedAt());
        return item;
    }).toList();
    
    return ApiResponse.ok(result);
}
```

### 模块 4: Agent 端 GPU 隔离

**改动文件:** `agent/executor.py`

#### 4.1 CUDA_VISIBLE_DEVICES 环境隔离

```python
# executor.py — _run_task 方法增强

def _run_task(self, task_id, eval_type, params, chip_info=None):
    # ... 解析 run_spec ...
    
    # ====== GPU 隔离 ======
    run_spec = params.pop("_run_spec", {}) or {}
    gpu_indices = run_spec.get("gpuIndices", [])
    parallel_mode = run_spec.get("parallelMode", "")
    gpu_count = len(gpu_indices) if gpu_indices else 0
    
    env = os.environ.copy()
    if gpu_indices:
        cuda_devices = ",".join(str(i) for i in sorted(gpu_indices))
        env["CUDA_VISIBLE_DEVICES"] = cuda_devices
        logger.info("GPU 隔离: CUDA_VISIBLE_DEVICES=%s (%d GPUs)", cuda_devices, gpu_count)
    
    # 注入 GPU 信息到脚本参数
    params["_gpu_count"] = gpu_count
    params["_gpu_indices"] = gpu_indices
    params["_parallel_mode"] = parallel_mode
    
    # ====== 启动方式选择 ======
    cmd = self._build_launch_command(script_path, params, gpu_count, parallel_mode)
    
    process = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, cwd=self.project_root,
        env=env  # 传入隔离环境
    )
    # ... 其余逻辑不变 ...
```

#### 4.2 智能启动方式

```python
def _build_launch_command(self, script_path, params, gpu_count, parallel_mode):
    """根据任务类型和 GPU 数量选择启动方式
    
    策略:
    - 单卡/CPU: python3 script.py '{params}'
    - 多卡推理: python3 script.py '{params}'  (脚本内用 DataParallel)
    - 多卡训练 DDP: torchrun --nproc_per_node=N script.py '{params}'
    """
    params_json = json.dumps(params, ensure_ascii=False)
    
    # DDP 训练 + 多卡 → torchrun
    if gpu_count > 1 and parallel_mode.upper() in ("DDP", "FSDP"):
        # 使用随机 master_port 避免冲突（多任务同节点）
        import random
        port = random.randint(29500, 29999)
        return [
            "torchrun",
            f"--nproc_per_node={gpu_count}",
            f"--master_port={port}",
            "--standalone",
            script_path,
            params_json,
        ]
    
    # 其他情况：普通 python 启动
    # 多卡推理在脚本内部用 DataParallel 处理
    return ["python3", script_path, params_json]
```

### 模块 5: 评测脚本多卡改造

**改动文件:** `eval-scripts/model_inference.py`, `eval-scripts/model_training_benchmark.py`, `eval-scripts/operator_benchmark.py`

#### 5.1 多卡推理 (model_inference.py)

社区最佳实践参考: PyTorch DataParallel / HuggingFace accelerate

```python
def setup_model_for_inference(model, chip_info, params):
    """根据可用 GPU 数量设置推理模型
    
    策略:
    - 0 GPU (CPU): model.to("cpu")
    - 1 GPU: model.to("cuda:0")
    - N GPU: nn.DataParallel(model)
      - batch 自动沿 dim=0 切分到各卡
      - 对用户透明，batch_size 线性扩展
    """
    gpu_count = params.get("_gpu_count", 0)
    device = resolve_device(chip_info)
    
    if device is None or (hasattr(device, 'type') and device.type == "cpu"):
        return model.to("cpu"), torch.device("cpu"), 1
    
    import torch
    visible_gpus = torch.cuda.device_count()  # CUDA_VISIBLE_DEVICES 已生效
    
    if visible_gpus <= 1:
        model = model.to(device)
        return model, device, 1
    
    # 多卡推理: DataParallel
    model = model.to("cuda:0")
    model = torch.nn.DataParallel(model)
    print(f"[MULTI-GPU] DataParallel inference on {visible_gpus} GPUs", flush=True)
    
    return model, torch.device("cuda:0"), visible_gpus


def run_inference_benchmark(model, device, gpu_count, batch_size, ...):
    """推理 benchmark — batch_size 随 GPU 数线性扩展"""
    effective_batch = batch_size * gpu_count  # 多卡时自动扩大 batch
    # ... 运行推理循环，计算 throughput ...
```

#### 5.2 多卡训练 (model_training_benchmark.py)

社区最佳实践参考: PyTorch DDP + torchrun

```python
# ====== DDP 支持 ======

def setup_distributed():
    """检测并初始化 DDP 环境
    
    被 torchrun 启动时，以下环境变量由 torchrun 自动设置:
    - RANK: 全局 rank
    - LOCAL_RANK: 本机 rank (GPU 编号)
    - WORLD_SIZE: 总进程数
    - MASTER_ADDR/MASTER_PORT: 通信地址
    """
    import torch.distributed as dist
    
    if "RANK" not in os.environ:
        return False, 0, 0, 1  # 非 DDP 模式
    
    rank = int(os.environ["RANK"])
    local_rank = int(os.environ["LOCAL_RANK"])
    world_size = int(os.environ["WORLD_SIZE"])
    
    dist.init_process_group(
        backend="nccl",  # GPU 用 nccl（最优）
        rank=rank,
        world_size=world_size,
    )
    torch.cuda.set_device(local_rank)
    
    if rank == 0:
        print(f"[DDP] Initialized: world_size={world_size}, backend=nccl", flush=True)
    
    return True, rank, local_rank, world_size


def wrap_model_for_training(model, is_ddp, local_rank, gpu_count):
    """根据环境包装模型
    
    优先级:
    1. DDP (torchrun 启动): DistributedDataParallel — 最高效
    2. DataParallel (普通启动 + 多卡): 简单但 GIL 瓶颈
    3. 单卡: 直接 .to(device)
    """
    if is_ddp:
        device = torch.device(f"cuda:{local_rank}")
        model = model.to(device)
        model = torch.nn.parallel.DistributedDataParallel(
            model, device_ids=[local_rank])
        return model, device
    
    if gpu_count > 1:
        model = model.to("cuda:0")
        model = torch.nn.DataParallel(model)
        return model, torch.device("cuda:0")
    
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    return model.to(device), device


def create_dataloader(dataset, is_ddp, world_size, rank, batch_size, ...):
    """创建 DataLoader — DDP 模式使用 DistributedSampler"""
    if is_ddp:
        sampler = torch.utils.data.distributed.DistributedSampler(
            dataset, num_replicas=world_size, rank=rank, shuffle=True)
        return torch.utils.data.DataLoader(
            dataset, batch_size=batch_size, sampler=sampler,
            num_workers=4, pin_memory=True)
    
    return torch.utils.data.DataLoader(
        dataset, batch_size=batch_size, shuffle=True,
        num_workers=4, pin_memory=True)


def train_loop(model, dataloader, optimizer, epochs, is_ddp, rank, ...):
    """训练循环 — DDP 下只有 rank=0 输出日志"""
    for epoch in range(epochs):
        if is_ddp and hasattr(dataloader.sampler, 'set_epoch'):
            dataloader.sampler.set_epoch(epoch)  # DDP 数据打散
        
        for batch in dataloader:
            # ... forward + backward + step ...
            pass
        
        if rank == 0:  # 只有主进程输出
            print(json.dumps({"epoch": epoch, "loss": avg_loss, ...}), flush=True)
    
    if is_ddp:
        torch.distributed.destroy_process_group()
```

#### 5.3 算子 Benchmark 多卡支持 (operator_benchmark.py)

算子级 benchmark 通常是单卡场景（算子不跨卡），但可以**多卡并行跑不同算子**以加速测试：

```python
def run_multi_gpu_operator_benchmarks(operators, gpu_count):
    """多卡并行算子测试 — 每张卡跑不同的算子子集
    
    例: 10 个算子 + 4 张卡 → 每卡跑 2-3 个算子，并行执行
    """
    import multiprocessing as mp
    
    # 按卡数平均分配算子
    chunks = [[] for _ in range(gpu_count)]
    for i, op in enumerate(operators):
        chunks[i % gpu_count].append(op)
    
    results = {}
    with mp.Pool(gpu_count) as pool:
        futures = []
        for gpu_id, op_list in enumerate(chunks):
            futures.append(pool.apply_async(
                _run_ops_on_device, (gpu_id, op_list)))
        
        for fut in futures:
            results.update(fut.get(timeout=600))
    
    return results
```

### 模块 6: K8s Device Plugin 集成（Phase 2）

> 当前 Agent 模式用 CUDA_VISIBLE_DEVICES 隔离已满足需求。
> K8s 场景在 Phase 2 通过 Device Plugin 实现更细粒度的调度。

#### 6.1 原理

K8s NVIDIA Device Plugin 通过 kubelet Device Plugin API 将 GPU 注册为扩展资源：

```
Allocatable:
  nvidia.com/gpu: 8
```

Pod 请求 GPU 时，kubelet 通过 Device Plugin 分配具体设备：

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: eval-task
    resources:
      limits:
        nvidia.com/gpu: 4  # 请求 4 张 GPU
```

#### 6.2 与平台集成方式

1. ACK 集群安装 NVIDIA GPU Device Plugin（阿里云 ACK 已预装）
2. 平台通过 `kubectl describe node` 获取 GPU Allocatable/Allocated
3. 同步到 gpu_slots 表（与 Agent 上报机制互补）
4. 任务以 K8s Job 形式提交，resource limits 中声明 GPU 数量

```java
// K8s 节点 GPU 信息同步
public void syncK8sNodeGpu(String nodeName, int allocatable, int allocated) {
    // 更新 gpu_slots: allocatable = total, allocated = 已分配
    // 与 Agent 上报不同，K8s 场景由 kubelet 管理设备分配
}
```

## 数据库 Schema 变更

```sql
-- 1. ComputeNode 新增 gpu_count（冗余字段，查询效率）
ALTER TABLE compute_nodes ADD COLUMN IF NOT EXISTS gpu_count INTEGER DEFAULT 0;

-- 2. EvaluationTask 新增排队信息字段
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS estimated_wait_minutes INTEGER;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS allocated_gpu_indices TEXT;

-- 3. gpu_slots 表已存在，无需改动
```

## 前端展示

### 节点详情页

- GPU 卡片列表：每张卡显示型号、显存（已用/总量）、温度、功耗、当前占用任务
- GPU 利用率柱状图（实时刷新）
- 总 GPU 数 / 空闲数 / 已分配数

### 任务列表

- QUEUED 状态列增加：
  - 🔢 排队位置（第 X 位）
  - ⏱️ 预估等待时间
  - 💬 排队原因（如「等待 GPU 资源释放（gpu-l40s-01: 2/8 空闲，需要 4）」）
- 排队任务可展开查看详细资源需求

### GPU 全局看板（Dashboard）

- 全局 GPU 利用率环形图
- 各节点 GPU 使用热力图
- 当前排队任务数 + 平均等待时间

## 实施计划

| 阶段 | 内容 | 预估工时 | 依赖 |
|------|------|----------|------|
| **P1** | Agent GPU 探测 + 注册/心跳上报 | 4h | 无 |
| **P2** | 后端 Slot 自动初始化 + ComputeNode.gpuCount | 4h | P1 |
| **P3** | CUDA_VISIBLE_DEVICES 隔离 + executor 启动增强 | 3h | P2 |
| **P4** | 多卡推理脚本改造（DataParallel） | 4h | P3 |
| **P5** | 多卡训练脚本改造（DDP + torchrun） | 5h | P3 |
| **P6** | 排队状态 API + 前端展示 | 4h | P2 |
| **P7** | L40S x8 集成测试 | 4h | P4 + P5 |
| _Phase 2_ | _K8s Device Plugin 集成_ | _8h_ | _P7_ |

**总计: Phase 1 约 28h，Phase 2 另计 8h**

P1→P2→P3 串行（数据链路依赖），P4/P5/P6 可并行。

## 测试验证计划

### 自动化测试用例

1. **GPU 上报测试** — Agent 注册后，验证 gpu_slots 表自动创建 N 条记录
2. **Slot 分配测试** — 创建需要 4 GPU 的任务，验证分配了连续 4 个 slot
3. **排队测试** — 8 卡全占满后，新任务状态为 QUEUED，queueReason 包含 GPU 信息
4. **隔离测试** — 同节点两个任务分别用 GPU 0-3 和 4-7，互不干扰
5. **多卡推理测试** — 4 卡 DataParallel 推理，throughput 接近 4x 单卡
6. **多卡训练测试** — 4 卡 DDP 训练，验证 torchrun 正确启动 + loss 收敛
7. **孤儿回收测试** — 任务异常终止后，slot 在 5 分钟内自动回收
8. **排队消费测试** — 任务完成释放 GPU 后，QUEUED 任务自动调度

### 真机验证（L40S x8）

- 2 卡推理 vs 4 卡推理 vs 8 卡推理 性能对比
- 2 卡 DDP 训练 vs 4 卡 vs 8 卡 扩展性验证
- 混合负载：4 卡推理 + 4 卡训练 同时跑，验证隔离
