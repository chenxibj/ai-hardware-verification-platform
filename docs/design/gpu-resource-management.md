# GPU 芯片级资源管理与调度 — 设计方案

> **v2 更新 (2026-04-18):** 根据麦克雷 Code Review 反馈修订（[#478 评论](https://github.com/chenxibj/ai-hardware-verification-platform/issues/478#issuecomment-4272650244)）
> - 🔴 syncGpuSlots 增加节点级分布式锁，防止注册/心跳并发重复创建
> - 🔴 DDP master_port 改为 bind-then-release 获取可用端口
> - 🔴 排队位置改为查询时实时计算，不再 saveAll 写入
> - 🟡 GPU 采集改用 pynvml（注册时 nvidia-smi fallback）
> - 🟡 多卡推理改用 device_map="auto"（HuggingFace 模型）+ DataParallel（自定义模型 fallback）
> - 🟡 移除 allocatedGpuIndices 冗余字段
> - 🟡 排队预估时间按 evalType 分组计算

## 背景与目标

当前平台 GPU 节点（如 L40S x8）已注册但缺少芯片级资源管理：GPU 总数未上报、Slot 未自动初始化、评测脚本不支持多卡并行、任务排队状态不透明。

### 目标

1. **评测任务按规格分配 GPU 芯片** — 任务根据 RunSpec 声明的 gpuPerNode 数量，精确分配指定数量的 GPU 卡
2. **芯片不足时任务排队，状态实时可查** — QUEUED 任务可查看队列位置、等待原因、预估等待时间
3. **训练和推理脚本支持多卡** — 多卡推理（device_map / DataParallel）、多卡训练（DDP + torchrun），参考社区最佳实践

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
│  pynvml 探测     │                │ 节点级锁保护下   │          │ 节点详情     │
│  gpu_count       │                │ 自动初始化       │          │  └ GPU Slot  │
│  gpu_models[]    │                │ gpu_slots 行     │          │    实时状态   │
│  gpu_memory[]    │                │                  │          │              │
├─────────────────┤                ├──────────────────┤          │ 任务列表     │
│ 心跳时:          │ ──heartbeat──> │ 更新 gpu_slots   │          │  └ 排队位置  │
│  pynvml 实时指标 │                │ 状态/温度/显存    │          │  └ 等待原因  │
│  gpu_memory_used │                │                  │          │  └ 预估时间  │
│  gpu_temperature │                │                  │          │    (查询时   │
│  gpu_power       │                │                  │          │     实时计算) │
├─────────────────┤                ├──────────────────┤          │ GPU 总览面板 │
│ 执行任务时:      │                │ TaskDispatcher:  │          │  └ 全局利用率│
│  CUDA_VISIBLE_   │ <──dispatch──  │  gpu_slots 分配  │          └──────────────┘
│  DEVICES=0,1     │                │  连续卡优选      │
│  torchrun        │                │  排队+原因       │
│  (bind-release   │                │  自动回收        │
│   获取端口)      │                │                  │
└─────────────────┘                └──────────────────┘
```

## 详细设计

### 模块 1: Agent GPU 探测与上报

**改动文件:** `agent/collector.py`, `agent/register.py`, `agent/heartbeat.py`

**新增依赖:** `pynvml` (pip install nvidia-ml-py)

#### 1.1 GPU 详细信息采集（pynvml 优先）

> **v2 变更:** 心跳高频调用（每 10-30s）改用 pynvml C 库绑定，避免每次 fork nvidia-smi 进程。
> 注册时仍保留 nvidia-smi fallback（兼容无 pynvml 环境）。

`collector.py` 新增 `get_gpu_info_detailed()`:

```python
import logging

logger = logging.getLogger(__name__)

# ── pynvml 初始化（进程生命周期内只做一次）──
_nvml_initialized = False

def _ensure_nvml():
    """懒初始化 pynvml，进程内只调用一次 nvmlInit"""
    global _nvml_initialized
    if _nvml_initialized:
        return True
    try:
        import pynvml
        pynvml.nvmlInit()
        _nvml_initialized = True
        return True
    except Exception as e:
        logger.debug("pynvml init failed: %s", e)
        return False


def get_gpu_info_detailed():
    """探测 GPU 详细信息
    
    优先级: pynvml（C 库，零进程开销）> nvidia-smi（fork 进程）> torch.cuda（最基础）

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
    # ── 方案 1: pynvml（推荐，心跳高频场景零开销）──
    gpus = _collect_via_pynvml()
    if gpus is not None:
        return {"gpu_count": len(gpus), "gpus": gpus}
    
    # ── 方案 2: nvidia-smi fallback（注册时兜底）──
    gpus = _collect_via_nvidia_smi()
    if gpus:
        return {"gpu_count": len(gpus), "gpus": gpus}
    
    # ── 方案 3: torch.cuda（最后兜底）──
    gpus = _collect_via_torch_cuda()
    return {"gpu_count": len(gpus), "gpus": gpus}


def _collect_via_pynvml():
    """通过 pynvml C 绑定采集 GPU 信息（零 fork 开销）"""
    if not _ensure_nvml():
        return None
    try:
        import pynvml
        count = pynvml.nvmlDeviceGetCount()
        gpus = []
        for i in range(count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            name = pynvml.nvmlDeviceGetName(handle)
            if isinstance(name, bytes):
                name = name.decode("utf-8")
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            
            try:
                temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                temp = None
            
            try:
                power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # mW → W
            except Exception:
                power = None
            
            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = util.gpu
                mem_util = util.memory
            except Exception:
                gpu_util = None
                mem_util = None
            
            gpus.append({
                "index": i,
                "name": name,
                "memory_total_mb": mem_info.total // 1048576,
                "memory_used_mb": mem_info.used // 1048576,
                "memory_free_mb": mem_info.free // 1048576,
                "temperature_c": temp,
                "power_draw_w": round(power, 1) if power else None,
                "utilization_gpu_percent": gpu_util,
                "utilization_memory_percent": mem_util,
            })
        return gpus
    except Exception as e:
        logger.warning("pynvml collect failed: %s", e)
        return None


def _collect_via_nvidia_smi():
    """通过 nvidia-smi CLI 采集（fork 进程，注册时兜底用）"""
    try:
        import subprocess
        result = subprocess.run(
            ['nvidia-smi',
             '--query-gpu=index,name,memory.total,memory.used,memory.free,'
             'temperature.gpu,power.draw,utilization.gpu,utilization.memory',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return []
        gpus = []
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
        return gpus
    except FileNotFoundError:
        return []  # 无 nvidia-smi（CPU 节点）
    except Exception as e:
        logger.warning("nvidia-smi collect failed: %s", e)
        return []


def _collect_via_torch_cuda():
    """通过 torch.cuda 采集（最基础信息，无温度/功耗/利用率）"""
    try:
        import torch
        gpus = []
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
        return gpus
    except Exception:
        return []


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

    # GPU 实时指标（pynvml 零开销，每次心跳都上报）
    gpu_info = get_gpu_info_detailed()
    metrics["gpu_count"] = gpu_info["gpu_count"]
    metrics["gpus"] = gpu_info["gpus"]

    return metrics
```

### 模块 2: 后端 GPU Slot 自动初始化

**改动文件:** `GpuSlotService.java`, `ComputeNodeService.java`

#### 2.1 Slot 同步逻辑（带节点级锁）

> **v2 变更（🔴修复）:** syncGpuSlots 增加节点级分布式锁。
> 注册和心跳可能并发调用 syncGpuSlots（同一节点），如果不加锁会导致重复创建 Slot（违反唯一约束或产生幽灵行）。
> 
> **方案:** 使用 PostgreSQL Advisory Lock（`pg_advisory_xact_lock(nodeId)`），事务级锁，事务结束自动释放，无死锁风险。
> 选择 Advisory Lock 而非 Java synchronized 的原因：多实例部署时 Java 锁无效，DB 级锁全局生效。

```java
// GpuSlotService.java 新增

/**
 * 根据 Agent 上报的 GPU 信息，同步 gpu_slots 表
 * 触发时机：节点注册 + 心跳中检测到 gpu_count 变化
 *
 * 🔴 并发安全：使用 PostgreSQL Advisory Lock 保证同一节点的注册/心跳不会并发创建 Slot
 * Advisory Lock 是事务级的，事务提交/回滚后自动释放
 *
 * 策略：
 * - gpu_count 匹配 → 只更新元信息（型号/显存）
 * - gpu_count 不匹配 → 增量同步（不删 ALLOCATED 状态的 slot）
 */
@Transactional
public void syncGpuSlots(Long nodeId, int gpuCount, List<Map<String, Object>> gpuDetails) {
    // 🔴 节点级锁：防止注册/心跳并发导致重复创建
    // pg_advisory_xact_lock 在当前事务结束后自动释放
    entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(:nodeId)")
        .setParameter("nodeId", nodeId)
        .getSingleResult();
    
    List<GpuSlot> existing = gpuSlotRepository.findByNodeIdOrderByGpuIndex(nodeId);
    
    if (existing.size() == gpuCount && gpuCount > 0) {
        // 数量一致，只更新元信息（型号/显存）— 不涉及创建，无锁竞争风险
        for (GpuSlot slot : existing) {
            Map<String, Object> detail = findGpuByIndex(gpuDetails, slot.getGpuIndex());
            if (detail != null) {
                slot.setGpuModel((String) detail.get("name"));
                Integer memMb = toInteger(detail.get("memory_total_mb"));
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
    List<GpuSlot> newSlots = new ArrayList<>();
    for (int i = 0; i < gpuCount; i++) {
        if (existingIndices.contains(i)) continue;
        GpuSlot slot = new GpuSlot();
        slot.setNodeId(nodeId);
        slot.setGpuIndex(i);
        Map<String, Object> detail = findGpuByIndex(gpuDetails, i);
        if (detail != null) {
            slot.setGpuModel((String) detail.get("name"));
            Integer memMb = toInteger(detail.get("memory_total_mb"));
            if (memMb != null) slot.setGpuMemoryGb(memMb / 1024);
        }
        slot.setStatus("FREE");
        newSlots.add(slot);
    }
    gpuSlotRepository.saveAll(newSlots);  // 批量保存，减少 SQL 往返
    
    log.info("Synced GPU slots for node {}: {} slots (was {}, created {})", 
             nodeId, gpuCount, existing.size(), newSlots.size());
}

private Map<String, Object> findGpuByIndex(List<Map<String, Object>> gpus, int index) {
    if (gpus == null) return null;
    return gpus.stream()
        .filter(g -> Integer.valueOf(index).equals(toInteger(g.get("index"))))
        .findFirst().orElse(null);
}

private Integer toInteger(Object val) {
    if (val instanceof Integer) return (Integer) val;
    if (val instanceof Number) return ((Number) val).intValue();
    return null;
}
```

#### 2.2 触发入口

```java
// ComputeNodeService.java

@Transactional
public ComputeNode register(ComputeNode node) {
    // ... 现有注册逻辑 ...
    ComputeNode saved = repo.save(node);
    
    // 自动初始化 GPU Slots（syncGpuSlots 内部加了节点级锁，并发安全）
    syncGpuSlotsFromHardwareInfo(saved);
    return saved;
}

public void processHeartbeat(Long nodeId, Map<String, Object> metrics) {
    // ... 现有心跳处理 ...
    
    // 检查 gpu_count 是否变化（只有变化时才触发 sync，减少锁竞争）
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

### 模块 3: 任务排队增强（查询时实时计算）

**改动文件:** `EvaluationTaskController.java`, `EvaluationTaskRepository.java`

> **v2 变更（🔴修复）:** 排队位置和预估时间改为**查询时实时计算**，不再每次调度循环 saveAll。
> 原方案的问题：每次调度循环对所有 QUEUED 任务做 saveAll，在 100+ 排队任务时产生严重的写放大。
> 修改后：queuePosition / estimatedWaitMinutes 不持久化到 DB，由 API 层查询时实时算出返回。

> **v2 变更（🟡优化）:** 移除 `allocatedGpuIndices` 字段。
> 分配的 GPU 编号已在 `gpu_slots` 表中通过 `allocated_task_id` 关联，无需冗余存储。
> 查询时 JOIN gpu_slots 即可得到。

> **v2 变更（🟡优化）:** 预估等待时间按 `evalType` 分组计算。
> 不同类型任务耗时差异大（算子 benchmark ~2 分钟 vs 模型训练 ~30 分钟），
> 混合平均会导致预估不准。

#### 3.1 数据库 Schema 变更（简化）

```sql
-- 只需新增 ComputeNode.gpu_count，不再需要 task 排队字段
ALTER TABLE compute_nodes ADD COLUMN IF NOT EXISTS gpu_count INTEGER DEFAULT 0;

-- 不再需要:
-- ALTER TABLE evaluation_tasks ADD COLUMN queue_position INTEGER;        -- 查询时计算
-- ALTER TABLE evaluation_tasks ADD COLUMN estimated_wait_minutes INTEGER; -- 查询时计算
-- ALTER TABLE evaluation_tasks ADD COLUMN allocated_gpu_indices TEXT;     -- gpu_slots 表已有
```

#### 3.2 队列查询 API（实时计算排队位置和预估时间）

```java
// EvaluationTaskController.java 新增

/**
 * 查询排队中的任务列表（排队位置和预估时间实时计算，不持久化）
 * 
 * 🔴 v2: 不再 saveAll，零写放大
 * 🟡 v2: 预估时间按 evalType 分组
 */
@GetMapping("/tasks/queue")
public ApiResponse<List<Map<String, Object>>> getTaskQueue() {
    List<EvaluationTask> queued = taskRepository
        .findQueuedTasksOrderByPriorityAndCreatedAt();
    
    // 🟡 按 evalType 分组计算平均完成耗时（最近 100 个已完成任务）
    Map<String, Double> avgDurationByType = taskRepository
        .findAverageDurationByEvalType();  // 返回 Map<evalType, avgSeconds>
    double defaultAvgMin = 10.0; // 未知类型默认 10 分钟
    
    // 按 evalType 分组计算排队位置（同类型任务排在前面的会先消耗资源）
    Map<String, Integer> typeQueueCounter = new HashMap<>();
    
    List<Map<String, Object>> result = new ArrayList<>();
    for (int i = 0; i < queued.size(); i++) {
        EvaluationTask task = queued.get(i);
        String evalType = task.getEvalType() != null ? task.getEvalType().name() : "UNKNOWN";
        
        // 总排队位置
        int globalPosition = i + 1;
        
        // 同类型排队位置
        int typePosition = typeQueueCounter.merge(evalType, 1, Integer::sum);
        
        // 预估等待时间（基于同类型平均耗时 × 同类型前面排了几个）
        double avgSec = avgDurationByType.getOrDefault(evalType, defaultAvgMin * 60);
        int estimatedWaitMin = (int) Math.ceil(avgSec * typePosition / 60.0);
        
        // 查询分配的 GPU 信息（从 gpu_slots 表关联）
        int gpuNeeded = resolveGpuNeeded(task);
        
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("taskId", task.getId());
        item.put("taskNo", task.getTaskNo());
        item.put("evalType", evalType);
        item.put("queuePosition", globalPosition);
        item.put("estimatedWaitMinutes", estimatedWaitMin);
        item.put("queueReason", task.getQueueReason());
        item.put("gpuNeeded", gpuNeeded);
        item.put("createdAt", task.getCreatedAt());
        result.add(item);
    }
    
    return ApiResponse.ok(result);
}
```

#### 3.3 Repository 新增查询

```java
// EvaluationTaskRepository.java 新增

/**
 * 🟡 按 evalType 分组计算最近已完成任务的平均耗时
 */
@Query(value = """
    SELECT eval_type, AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))
    FROM evaluation_tasks
    WHERE status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL
    AND completed_at > NOW() - INTERVAL '7 days'
    GROUP BY eval_type
    """, nativeQuery = true)
List<Object[]> findAverageDurationByEvalTypeRaw();

// Service 层封装为 Map<String, Double>
default Map<String, Double> findAverageDurationByEvalType() {
    Map<String, Double> result = new HashMap<>();
    for (Object[] row : findAverageDurationByEvalTypeRaw()) {
        if (row[0] != null && row[1] != null) {
            result.put(row[0].toString(), ((Number) row[1]).doubleValue());
        }
    }
    return result;
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

#### 4.2 智能启动方式（bind-then-release 端口选取）

> **v2 变更（🔴修复）:** DDP master_port 改为 bind-then-release。
> 原方案 `random.randint(29500, 29999)` 有碰撞风险：同节点两个 DDP 任务可能选到相同端口。
> 
> **bind-then-release 方案:** 先 bind(0) 让 OS 分配可用端口 → 读取端口号 → close socket → 传给 torchrun。
> 存在微小 TOCTOU 窗口（close 到 torchrun bind 之间端口被抢），但实践中：
> 1. 临时端口范围很大（32768-60999），碰撞概率极低
> 2. 比 random 好几个数量级（random 在 500 个端口里碰撞概率 = birthday problem）
> 3. 如果要消除 TOCTOU，需要 socket 继承（`--rdzv_backend=c10d --rdzv_endpoint=fd://`），复杂度高，Phase 2 考虑

```python
import socket

def _find_free_port():
    """Bind-then-release: 让 OS 分配可用端口，避免随机碰撞
    
    比 random.randint 可靠得多（OS 保证分配时该端口未被使用）。
    TOCTOU 窗口极小，临时端口范围 ~28000 个，实践中碰撞概率忽略不计。
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


def _build_launch_command(self, script_path, params, gpu_count, parallel_mode):
    """根据任务类型和 GPU 数量选择启动方式
    
    策略:
    - 单卡/CPU: python3 script.py '{params}'
    - 多卡推理: python3 script.py '{params}'  (脚本内用 device_map/DataParallel)
    - 多卡训练 DDP: torchrun --nproc_per_node=N script.py '{params}'
    """
    params_json = json.dumps(params, ensure_ascii=False)
    
    # DDP 训练 + 多卡 → torchrun
    if gpu_count > 1 and parallel_mode.upper() in ("DDP", "FSDP"):
        port = _find_free_port()  # 🔴 v2: bind-then-release 替代 random
        logger.info("DDP master_port=%d (bind-then-release)", port)
        return [
            "torchrun",
            f"--nproc_per_node={gpu_count}",
            f"--master_port={port}",
            "--standalone",
            script_path,
            params_json,
        ]
    
    # 其他情况：普通 python 启动
    # 多卡推理在脚本内部用 device_map="auto" / DataParallel 处理
    return ["python3", script_path, params_json]
```

### 模块 5: 评测脚本多卡改造

**改动文件:** `eval-scripts/model_inference.py`, `eval-scripts/model_training_benchmark.py`, `eval-scripts/operator_benchmark.py`

#### 5.1 多卡推理 (model_inference.py)

> **v2 变更（🟡优化）:** HuggingFace 模型优先使用 `device_map="auto"`（Accelerate 自动分片），
> 自定义模型 fallback 到 DataParallel。
> 
> **原因:** DataParallel 已被 PyTorch 社区标记为 legacy（GIL 瓶颈、单进程多线程），
> 对于 HuggingFace 模型，`device_map="auto"` + Accelerate 是当前标准做法：
> - 自动按 GPU 显存切分模型层（tensor parallelism）
> - 支持超大模型跨卡（单卡放不下也能跑）
> - 不需要改模型代码

```python
def setup_model_for_inference(model_or_name, chip_info, params):
    """根据可用 GPU 数量设置推理模型
    
    策略（v2 更新）:
    - 0 GPU (CPU): model.to("cpu")
    - 1 GPU: model.to("cuda:0")
    - N GPU + HuggingFace 模型: device_map="auto"（推荐，自动分片）
    - N GPU + 自定义模型: nn.DataParallel（fallback）
    """
    gpu_count = params.get("_gpu_count", 0)
    device = resolve_device(chip_info)
    
    if device is None or (hasattr(device, 'type') and device.type == "cpu"):
        if isinstance(model_or_name, str):
            return _load_hf_model(model_or_name, device="cpu"), torch.device("cpu"), 1
        return model_or_name.to("cpu"), torch.device("cpu"), 1
    
    import torch
    visible_gpus = torch.cuda.device_count()  # CUDA_VISIBLE_DEVICES 已生效
    
    # ── 多卡推理 ──
    if visible_gpus > 1:
        # 方案 A: HuggingFace 模型 — device_map="auto"
        if isinstance(model_or_name, str):
            try:
                from transformers import AutoModelForCausalLM
                model = AutoModelForCausalLM.from_pretrained(
                    model_or_name,
                    device_map="auto",          # Accelerate 自动分片
                    torch_dtype=torch.float16,  # 省显存
                )
                print(f"[MULTI-GPU] device_map='auto' on {visible_gpus} GPUs", flush=True)
                return model, torch.device("cuda:0"), visible_gpus
            except Exception as e:
                print(f"[MULTI-GPU] device_map failed: {e}, fallback to DataParallel", flush=True)
        
        # 方案 B: 自定义模型 fallback — DataParallel
        if not isinstance(model_or_name, str):
            model = model_or_name
        else:
            model = _load_hf_model(model_or_name, device="cuda:0")
        
        model = model.to("cuda:0")
        model = torch.nn.DataParallel(model)
        print(f"[MULTI-GPU] DataParallel fallback on {visible_gpus} GPUs", flush=True)
        return model, torch.device("cuda:0"), visible_gpus
    
    # ── 单卡 ──
    if isinstance(model_or_name, str):
        model = _load_hf_model(model_or_name, device=device)
    else:
        model = model_or_name.to(device)
    return model, device, 1


def _load_hf_model(model_name, device="cpu"):
    """加载 HuggingFace 模型的辅助函数"""
    try:
        from transformers import AutoModel
        return AutoModel.from_pretrained(model_name).to(device)
    except Exception:
        # 非 HF 模型名，可能是自定义路径
        return None


def run_inference_benchmark(model, device, gpu_count, batch_size, ...):
    """推理 benchmark — batch_size 随 GPU 数线性扩展"""
    effective_batch = batch_size * gpu_count  # 多卡时自动扩大 batch
    # ... 运行推理循环，计算 throughput ...
```

#### 5.2 多卡训练 (model_training_benchmark.py)

社区最佳实践参考: PyTorch DDP + torchrun (无变化，v1 方案已是最佳实践)

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
-- ComputeNode 新增 gpu_count（冗余字段，查询效率）
ALTER TABLE compute_nodes ADD COLUMN IF NOT EXISTS gpu_count INTEGER DEFAULT 0;

-- gpu_slots 表已存在，无需改动
-- evaluation_tasks 无新增列（排队信息查询时计算，GPU 信息从 gpu_slots JOIN）
```

## 前端展示

### 节点详情页

- GPU 卡片列表：每张卡显示型号、显存（已用/总量）、温度、功耗、当前占用任务
- GPU 利用率柱状图（实时刷新）
- 总 GPU 数 / 空闲数 / 已分配数

### 任务列表

- QUEUED 状态列增加：
  - 🔢 排队位置（第 X 位）
  - ⏱️ 预估等待时间（按任务类型计算）
  - 💬 排队原因（如「等待 GPU 资源释放（gpu-l40s-01: 2/8 空闲，需要 4）」）
- 排队任务可展开查看详细资源需求

### GPU 全局看板（Dashboard）

- 全局 GPU 利用率环形图
- 各节点 GPU 使用热力图
- 当前排队任务数 + 平均等待时间

## 实施计划

| 阶段 | 内容 | 预估工时 | 依赖 |
|------|------|----------|------|
| **P1** | Agent GPU 探测（pynvml + fallback）+ 注册/心跳上报 | 3h | 无 |
| **P2** | 后端 Slot 自动初始化（Advisory Lock）+ gpuCount | 3h | P1 |
| **P3** | CUDA_VISIBLE_DEVICES 隔离 + executor 启动增强（bind-release port） | 2h | P2 |
| **P4** | 多卡推理脚本改造（device_map="auto" + DataParallel fallback） | 3h | P3 |
| **P5** | 多卡训练脚本改造（DDP + torchrun） | 4h | P3 |
| **P6** | 排队状态查询 API（实时计算）+ 前端展示 | 3h | P2 |
| **P7** | L40S x8 集成测试 | 3h | P4 + P5 |
| _Phase 2_ | _K8s Device Plugin 集成_ | _8h_ | _P7_ |

**总计: Phase 1 约 21h（v2 精简），Phase 2 另计 8h**

P1→P2→P3 串行（数据链路依赖），P4/P5/P6 可并行。

## 测试验证计划

### 自动化测试用例

1. **GPU 上报测试** — Agent 注册后，验证 gpu_slots 表自动创建 N 条记录
2. **并发注册/心跳测试** — 同一节点并发调用 register + heartbeat，验证 Slot 不重复（Advisory Lock 生效）
3. **Slot 分配测试** — 创建需要 4 GPU 的任务，验证分配了连续 4 个 slot
4. **排队测试** — 8 卡全占满后，新任务状态为 QUEUED，queueReason 包含 GPU 信息
5. **隔离测试** — 同节点两个任务分别用 GPU 0-3 和 4-7，互不干扰
6. **多卡推理测试** — 4 卡 device_map="auto" 推理，throughput 接近线性扩展
7. **多卡训练测试** — 4 卡 DDP 训练，验证 torchrun 正确启动 + loss 收敛
8. **端口碰撞测试** — 同节点同时启动 2 个 DDP 任务，验证 bind-then-release 端口不冲突
9. **孤儿回收测试** — 任务异常终止后，slot 在 5 分钟内自动回收
10. **排队消费测试** — 任务完成释放 GPU 后，QUEUED 任务自动调度
11. **排队 API 测试** — /tasks/queue 返回正确的位置和按类型分组的预估时间

### 真机验证（L40S x8）

- 2 卡推理 vs 4 卡推理 vs 8 卡推理 性能对比
- 2 卡 DDP 训练 vs 4 卡 vs 8 卡 扩展性验证
- 混合负载：4 卡推理 + 4 卡训练 同时跑，验证隔离

---

## Review 变更追踪

| # | 来源 | 级别 | 变更内容 | 涉及模块 |
|---|------|------|----------|----------|
| 1 | 麦克雷 | 🔴 | syncGpuSlots 加 pg_advisory_xact_lock(nodeId) 节点级锁 | 模块 2 |
| 2 | 麦克雷 | 🔴 | DDP master_port 改为 bind-then-release 替代 random.randint | 模块 4.2 |
| 3 | 麦克雷 | 🔴 | 排队位置/预估时间改为查询时实时计算，不再 saveAll | 模块 3 |
| 4 | 麦克雷 | 🟡 | GPU 采集改用 pynvml（进程内 C 调用），nvidia-smi 降为 fallback | 模块 1.1 |
| 5 | 麦克雷 | 🟡 | 多卡推理优先 device_map="auto"，DataParallel 降为 fallback | 模块 5.1 |
| 6 | 麦克雷 | 🟡 | 移除 allocatedGpuIndices 冗余字段，通过 gpu_slots JOIN 查询 | 模块 3.1 |
| 7 | 麦克雷 | 🟡 | 排队预估时间按 evalType 分组计算 | 模块 3.2 |
