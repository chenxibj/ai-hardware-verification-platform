# 评测任务运行规格、资源池管理与多机多卡调度 — 完整设计

> 版本：v1.1 | 作者：菜菜子（产品经理 + 架构设计）| 日期：2026-04-12
> v1.1 更新：增加 GPU Slot 并发安全设计、多机错误处理、"修改规格"交互改进

---

## 一、设计背景

### 当前问题

1. **任务和节点是简单 1:1 关系** — 一个任务分配到一个节点执行，无法表达"单机多卡""多机多卡"等运行规格
2. **资源池没有芯片类型维度** — 现有资源池（`默认计算池`/`CPU Pool`）按用途分，没有按芯片型号聚合
3. **资源池没有区分 K8s 和裸金属** — K8s 节点和手动注册节点混在一起，调度策略应该不同
4. **调度器不理解多卡/多机** — 不能分配"4张 L40S"给一个分布式训练任务

### 设计目标

- 引入"运行规格"（RunSpec）概念，描述任务对算力资源的需求
- 重构资源池，按**芯片型号 × 接入方式**两个维度组织
- 调度器支持**单卡 / 单机多卡 / 多机多卡**三种模式
- 用户创建任务时能直观选择运行规格，系统自动匹配资源

---

## 二、典型用户场景

### 场景 1：算子精度测试（单机单卡）

> 测试工程师张工要验证 NVIDIA L40S 上 MatMul 算子的 FP16 精度

1. 创建评测任务 → 选择芯片"NVIDIA L40S" → 选择模板"算子精度验证"
2. 系统自动推荐运行规格：**单机单卡**（算子测试不需要多卡）
3. 选择资源池"L40S GPU 池" → 系统显示"3 节点在线，每节点 8 卡，共 24 卡可用"
4. 提交 → 调度器在池内找一个空闲节点，分配 1 张 GPU → 任务执行
5. 5 分钟后完成 → 报告显示"执行节点：gpu-l40s-01，GPU #3，芯片：NVIDIA L40S"

### 场景 2：模型推理性能测试（单机多卡）

> 测试 GPT-2 Medium 在 4 张 L40S 上的推理吞吐

1. 创建评测任务 → 芯片"NVIDIA L40S" → 模板"大模型推理测试"
2. 运行规格选择：**单机 4 卡**（tensor parallel = 4）
3. 资源池"L40S GPU 池" → 系统检查：需要某个节点有 ≥4 张空闲 GPU
4. 调度器找到 gpu-l40s-01（8 卡，当前 6 卡空闲）→ 分配 GPU #0-#3
5. Agent 用 `CUDA_VISIBLE_DEVICES=0,1,2,3` 启动推理
6. 报告标注"4 × NVIDIA L40S，Tensor Parallel"

### 场景 3：分布式训练测试（多机多卡）

> 在 2 台 L40S 服务器（共 16 张卡）上跑 Llama-7B 分布式训练 benchmark

1. 创建评测任务 → 芯片"NVIDIA L40S" → 模板"分布式训练基准"
2. 运行规格选择：**2 机 × 8 卡**（共 16 GPU）
3. 资源池"L40S GPU 池" → 系统检查：池内需要 ≥2 个节点，每节点 ≥8 卡空闲
4. 调度器分配 2 台机器 → 生成分布式启动配置（master IP、rank、world_size）
5. 两台机器的 Agent 协同执行 → torchrun / deepspeed 启动训练
6. 报告："2 nodes × 8 GPUs = 16 × NVIDIA L40S, DeepSpeed ZeRO-2"

### 场景 4：CPU 基准测试（单机多核）

> 在 CPU 节点上跑 ONNX Runtime 推理基准

1. 创建评测任务 → 芯片"Intel Xeon 8269CY" → 模板"CPU 推理基准"
2. 运行规格：**单机全核**（使用节点所有 CPU 核心）
3. 资源池"CPU 计算池" → 1 节点在线
4. 调度器分配 dev-node-01，不限制 CPU 核心（独占模式）
5. 报告："执行节点：dev-node-01，4 vCPU / 14GB"

### 场景 5：K8s 弹性测试（K8s Pod 调度）

> 在 K8s 集群中动态拉起 Pod 跑算子测试

1. 创建评测任务 → 选择 K8s 类型的资源池"ACK 集群 - L40S"
2. 运行规格：**K8s Pod（1 GPU）** → 系统生成 Pod spec（resource.limits: nvidia.com/gpu: 1）
3. 调度器通过 K8s API 提交 Job → K8s 自己调度到有 GPU 的节点
4. Pod 完成后回报结果 → Agent 或 Job 完成回调
5. 报告标注"K8s Pod，节点：ack-node-02，1 × NVIDIA L40S"

---

## 三、核心概念模型

```
┌─────────────────────────────────────────────────────┐
│                    用户创建评测任务                     │
│  选芯片 → 选模板 → 选运行规格 → 选资源池 → 提交       │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                    RunSpec（运行规格）                  │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │ 单机单卡  │  │ 单机多卡  │  │    多机多卡        │   │
│  │ 1N × 1G  │  │ 1N × kG  │  │    mN × kG        │   │
│  └──────────┘  └──────────┘  └───────────────────┘   │
│  算子测试      模型推理       分布式训练               │
│  精度验证      单机训练       大模型微调               │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              ResourcePool（资源池）                     │
│                                                       │
│  维度1: 芯片型号                                       │
│  ├── L40S GPU 池（所有装了 L40S 的节点）                │
│  ├── A100 GPU 池                                      │
│  ├── CPU 计算池（Intel Xeon 节点）                     │
│  └── 混合池（不限芯片类型）                             │
│                                                       │
│  维度2: 接入方式                                       │
│  ├── bare-metal（手动注册的物理机/VM）                  │
│  └── k8s（K8s 集群管理的节点）                         │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              Scheduler（调度器）                        │
│                                                       │
│  1. 解析 RunSpec 需求（几台机、几张卡）                 │
│  2. 在目标资源池中查找满足条件的节点组合                 │
│  3. 芯片亲和性硬约束（不跑错芯片）                      │
│  4. 分配 GPU slot / 生成分布式配置                      │
│  5. 下发到 Agent(s) 执行                               │
└─────────────────────────────────────────────────────┘
```

---

## 四、详细设计

### 4.1 RunSpec（运行规格）

#### 数据模型

```sql
-- 新表：运行规格预设
CREATE TABLE run_specs (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,          -- "单机单卡", "单机4卡", "2机×8卡"
    code            VARCHAR(64) UNIQUE NOT NULL,     -- "1n1g", "1n4g", "2n8g", "cpu-exclusive"
    
    -- 节点需求
    node_count      INT NOT NULL DEFAULT 1,          -- 需要几台机器
    
    -- GPU 需求（per node）
    gpu_per_node    INT NOT NULL DEFAULT 0,          -- 每台机器需要几张 GPU（0 = 不需要 GPU）
    gpu_exclusive   BOOLEAN DEFAULT false,           -- 是否独占整台机器的 GPU
    
    -- CPU 需求（per node）
    cpu_cores       INT,                             -- 需要几个 CPU 核心（null = 不限制）
    cpu_exclusive   BOOLEAN DEFAULT false,           -- 是否独占整台机器的 CPU
    
    -- 内存需求（per node）
    memory_gb       INT,                             -- 需要多少 GB 内存（null = 不限制）
    
    -- 分布式配置
    parallel_mode   VARCHAR(32),                     -- "none", "data_parallel", "tensor_parallel", "pipeline_parallel", "zero"
    
    -- 分类
    category        VARCHAR(32) NOT NULL,            -- "operator", "model", "training", "benchmark"
    description     TEXT,
    is_system       BOOLEAN DEFAULT false,           -- 系统预置 vs 用户自定义
    
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 系统预置运行规格
INSERT INTO run_specs (name, code, node_count, gpu_per_node, gpu_exclusive, cpu_cores, parallel_mode, category, is_system, description) VALUES
('单机单卡',       '1n1g',        1, 1, false, NULL,  'none',             'operator',  true, '算子测试、单模型推理，使用 1 张 GPU'),
('单机 2 卡',      '1n2g',        1, 2, false, NULL,  'tensor_parallel',  'model',     true, '中等模型推理，Tensor Parallel 2 路'),
('单机 4 卡',      '1n4g',        1, 4, false, NULL,  'tensor_parallel',  'model',     true, '大模型推理，Tensor Parallel 4 路'),
('单机 8 卡（独占）','1n8g',       1, 8, true,  NULL,  'data_parallel',    'training',  true, '单机全卡训练'),
('2 机 × 8 卡',    '2n8g',        2, 8, true,  NULL,  'zero',             'training',  true, '双机分布式训练（16 GPU）'),
('4 机 × 8 卡',    '4n8g',        4, 8, true,  NULL,  'zero',             'training',  true, '4 机分布式训练（32 GPU）'),
('CPU 独占',       'cpu-exclusive', 1, 0, false, NULL, 'none',             'benchmark', true, '使用全部 CPU 核心'),
('CPU 指定核数',   'cpu-cores',    1, 0, false, 4,     'none',             'benchmark', true, '指定 CPU 核心数'),
('K8s 单 GPU Pod', 'k8s-1g',      1, 1, false, NULL,  'none',             'operator',  true, 'K8s 环境单 GPU Pod');
```

#### Java Entity

```java
@Data @Entity @Table(name = "run_specs")
public class RunSpec {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private String name;
    private String code;           // "1n1g", "2n8g" etc.
    private Integer nodeCount;     // 几台机器
    private Integer gpuPerNode;    // 每台几张卡
    private Boolean gpuExclusive;  // 独占整机 GPU
    private Integer cpuCores;      // CPU 核心数需求
    private Boolean cpuExclusive;
    private Integer memoryGb;
    private String parallelMode;   // none/data_parallel/tensor_parallel/pipeline_parallel/zero
    private String category;       // operator/model/training/benchmark
    private String description;
    private Boolean isSystem;
}
```

#### 与评测任务的关系

```sql
-- evaluation_tasks 新增字段
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS run_spec_id BIGINT REFERENCES run_specs(id);
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS run_spec_code VARCHAR(64);  -- 冗余存储，方便查询

-- evaluation_plans 新增字段
ALTER TABLE evaluation_plans ADD COLUMN IF NOT EXISTS run_spec_id BIGINT REFERENCES run_specs(id);
```

#### 模板关联默认运行规格

```sql
-- evaluation_templates 新增字段（如果有模板表的话）
-- 每个模板可以有推荐的默认运行规格
ALTER TABLE evaluation_templates ADD COLUMN IF NOT EXISTS default_run_spec_id BIGINT REFERENCES run_specs(id);
```

---

### 4.2 ResourcePool（资源池）重构

#### 现状问题

当前资源池只有 `name` + `type`(COMPUTE/CPU) + `capacity`(JSON)，过于简单。

#### 新数据模型

```sql
-- 资源池表重构
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS chip_model VARCHAR(200);       -- 池内芯片型号
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS provider VARCHAR(32) DEFAULT 'bare-metal';  -- bare-metal / k8s
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS cluster_id BIGINT;             -- 关联 K8s 集群（provider=k8s 时）
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS gpu_per_node INT;              -- 池内节点的 GPU 数（用于调度计算）
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS scheduling_policy VARCHAR(32) DEFAULT 'least_loaded'; -- 调度策略
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS max_concurrent_tasks INT;      -- 最大并发任务数（0 = 不限）
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;        -- 池优先级（数字越大越优先）

-- 新增资源池示例数据
-- 基于芯片型号 + 接入方式组织
INSERT INTO resource_pools (name, type, chip_model, provider, gpu_per_node, description, capacity, status) VALUES
('L40S GPU 池',        'GPU',     'NVIDIA L40S',                'bare-metal', 8, '所有 L40S 物理机节点',          '{"nodes": 1, "gpus": 8}', 'ACTIVE'),
('CPU 计算池',          'CPU',     'Intel Xeon Platinum 8269CY', 'bare-metal', 0, 'CPU-only 评测节点',             '{"nodes": 1, "cpus": 4}', 'ACTIVE'),
('ACK-L40S 弹性池',    'GPU',     'NVIDIA L40S',                'k8s',        8, 'ACK 集群 L40S GPU 节点',        '{"nodes": 2, "gpus": 16}', 'ACTIVE');
```

#### 资源池与节点的关系

```
资源池 1:N 节点
每个节点只能属于一个资源池（通过 compute_nodes.resource_pool_id）
```

#### 资源池类型矩阵

| 资源池 | 芯片型号 | 接入方式 | 节点数 | GPU/节点 | 典型用途 |
|--------|---------|---------|--------|---------|---------|
| L40S GPU 池 | NVIDIA L40S | bare-metal | 1-N | 8 | L40S 评测 |
| A100 GPU 池 | NVIDIA A100 | bare-metal | 1-N | 8 | A100 评测 |
| CPU 计算池 | Intel Xeon | bare-metal | 1-N | 0 | CPU 评测 |
| ACK-L40S 弹性池 | NVIDIA L40S | k8s | 动态 | 8 | K8s 弹性评测 |
| ACK-CPU 弹性池 | - | k8s | 动态 | 0 | K8s CPU 评测 |
| 混合开发池 | 不限 | 不限 | 不限 | 不限 | 开发调试 |

#### 调度策略

资源池支持以下调度策略：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| `least_loaded` | 优先选负载最低的节点 | 默认策略 |
| `round_robin` | 轮询分配 | 均匀分布 |
| `pack` | 尽量堆积到同一节点（减少碎片） | GPU 密集型 |
| `spread` | 尽量分散到不同节点 | 容错优先 |
| `k8s_native` | 委托 K8s 调度器 | K8s 池 |

---

### 4.3 调度器（Scheduler）重构

#### 调度流程总览

```
用户提交评测计划
       │
       ▼
┌──────────────────┐
│ 1. 解析 RunSpec   │  确定需要 m 台机器、每台 k 张 GPU
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. 确定目标资源池  │  Plan 指定 → 用指定的 | 芯片匹配 → 自动选择
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ 3. 芯片亲和性检查（硬约束）                 │
│    资源池芯片 ≠ 任务芯片 → 拒绝             │
│    资源池内无匹配节点 → QUEUED + 原因        │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ 4. 节点选择 & GPU Slot 分配                │
│                                            │
│    ┌─ bare-metal 池 ─────────────────┐    │
│    │  单机单卡：选 1 节点，分配 1 GPU  │    │
│    │  单机多卡：选 1 节点，分配 k GPU  │    │
│    │  多机多卡：选 m 节点，各分配 k GPU│    │
│    └─────────────────────────────────┘    │
│    ┌─ K8s 池 ────────────────────────┐    │
│    │  生成 K8s Job spec               │    │
│    │  resource.limits.nvidia.com/gpu  │    │
│    │  提交到 K8s API                  │    │
│    └─────────────────────────────────┘    │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ 5. 生成分布式配置（多机时）                 │
│    master_addr, master_port               │
│    node_rank, world_size                  │
│    nproc_per_node                         │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ 6. 下发执行                                │
│    单机：POST /execute 到 1 个 Agent       │
│    多机：POST /execute 到 m 个 Agents      │
│          （附带分布式配置）                  │
└──────────────────────────────────────────┘
```

#### GPU Slot 管理

引入 **GPU Slot** 概念，追踪每个节点上每张 GPU 的使用状态：

```sql
-- 新表：GPU Slot
CREATE TABLE gpu_slots (
    id              BIGSERIAL PRIMARY KEY,
    node_id         BIGINT NOT NULL REFERENCES compute_nodes(id),
    gpu_index       INT NOT NULL,           -- GPU 编号 (0-7)
    gpu_model       VARCHAR(200),           -- "NVIDIA L40S"
    gpu_memory_gb   INT,                    -- 显存 GB
    status          VARCHAR(16) NOT NULL DEFAULT 'FREE',  -- FREE / ALLOCATED / ERROR
    allocated_task_id BIGINT,               -- 当前分配给哪个任务
    allocated_at    TIMESTAMP,
    version         BIGINT NOT NULL DEFAULT 0,  -- 乐观锁版本号（并发安全）
    
    UNIQUE(node_id, gpu_index)
);

-- gpu-l40s-01 有 8 张 L40S
INSERT INTO gpu_slots (node_id, gpu_index, gpu_model, gpu_memory_gb)
SELECT 18, gs, 'NVIDIA L40S', 48
FROM generate_series(0, 7) gs;
```

#### GPU Slot 并发安全设计

多个调度实例（定时任务 + 手动触发 + API 调用）可能同时尝试分配 GPU，必须保证不会把同一张卡分给两个任务。

**方案：乐观锁 + 原子 CAS 更新**

```java
@Entity @Table(name = "gpu_slots")
public class GpuSlot {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private Long nodeId;
    private Integer gpuIndex;
    private String gpuModel;
    private Integer gpuMemoryGb;
    private String status;        // FREE / ALLOCATED / ERROR
    private Long allocatedTaskId;
    private Instant allocatedAt;
    
    @Version
    private Long version;         // JPA 乐观锁，UPDATE 时自动 +1
}
```

**分配流程（原子操作）：**

```java
/**
 * 分配 k 张 GPU 给任务，使用 SELECT FOR UPDATE 悲观锁
 * 保证多调度实例并发安全
 */
@Transactional(isolation = Isolation.READ_COMMITTED)
public List<GpuSlot> allocateGpuSlots(Long nodeId, int count, Long taskId) {
    // 1. 悲观锁查询：锁住该节点所有 FREE 的 slot
    List<GpuSlot> freeSlots = gpuSlotRepository.findFreeSlotsByNodeForUpdate(nodeId);
    
    if (freeSlots.size() < count) {
        throw new InsufficientGpuException(
            String.format("节点 %d 空闲 GPU 不足：需要 %d，可用 %d", nodeId, count, freeSlots.size()));
    }
    
    // 2. 取前 k 个（优先连续编号，有利于 NVLink 通信）
    List<GpuSlot> selected = selectOptimalSlots(freeSlots, count);
    
    // 3. 原子更新状态
    for (GpuSlot slot : selected) {
        slot.setStatus("ALLOCATED");
        slot.setAllocatedTaskId(taskId);
        slot.setAllocatedAt(Instant.now());
    }
    gpuSlotRepository.saveAll(selected);
    
    return selected;
}

// Repository 方法：SELECT ... FOR UPDATE
@Query("SELECT g FROM GpuSlot g WHERE g.nodeId = :nodeId AND g.status = 'FREE' ORDER BY g.gpuIndex")
@Lock(LockModeType.PESSIMISTIC_WRITE)
List<GpuSlot> findFreeSlotsByNodeForUpdate(@Param("nodeId") Long nodeId);
```

**释放流程（任务完成/失败时）：**

```java
@Transactional
public void releaseGpuSlots(Long taskId) {
    List<GpuSlot> allocated = gpuSlotRepository.findByAllocatedTaskId(taskId);
    for (GpuSlot slot : allocated) {
        slot.setStatus("FREE");
        slot.setAllocatedTaskId(null);
        slot.setAllocatedAt(null);
    }
    gpuSlotRepository.saveAll(allocated);
    log.info("Released {} GPU slots for task {}", allocated.size(), taskId);
}
```

**并发安全保障层次：**

| 层次 | 机制 | 防护场景 |
|------|------|---------|
| DB 行锁 | `SELECT ... FOR UPDATE` | 两个调度线程同时分配同节点的 GPU |
| JPA 乐观锁 | `@Version` | 检测到并发修改时抛异常并重试 |
| 事务隔离 | `READ_COMMITTED` | 避免脏读已被其他事务分配的 slot |
| 应用层幂等 | 任务已有 GPU 分配 → 跳过 | 重复调度同一任务时不重复分配 |
| 定时回收 | 每 5 分钟扫描 | 孤儿 slot（任务已终态但 slot 未释放）|

**GPU Slot 选择策略（`selectOptimalSlots`）：**

```java
/**
 * 选择最优的 k 张 GPU
 * 优先选连续编号（NVLink 拓扑邻近），其次选低编号
 */
private List<GpuSlot> selectOptimalSlots(List<GpuSlot> freeSlots, int count) {
    // 尝试找连续的 k 张
    for (int i = 0; i <= freeSlots.size() - count; i++) {
        boolean consecutive = true;
        for (int j = 1; j < count; j++) {
            if (freeSlots.get(i + j).getGpuIndex() != freeSlots.get(i).getGpuIndex() + j) {
                consecutive = false;
                break;
            }
        }
        if (consecutive) {
            return freeSlots.subList(i, i + count);
        }
    }
    // 没有连续的，取前 k 个（按编号排序）
    return freeSlots.subList(0, count);
}
```

---

#### 多机任务错误处理

多机任务（nodeCount > 1）中任意节点出问题时的处理策略：

**错误分类与处理：**

| 错误类型 | 触发条件 | 处理策略 |
|---------|---------|---------|
| Agent 不可达 | 分发时 HTTP 超时 | 该节点分配失败，整个任务不启动，QUEUED + 原因 |
| 启动失败 | Agent 返回非 2xx | 回滚所有已分配节点的 GPU slot，任务 FAILED |
| 执行中节点掉线 | 心跳超时 >3 分钟 | 整个多机任务标记 FAILED，回收全部 GPU slot |
| Master 节点挂了 | master_addr 不可达 | 同上，整个任务 FAILED（分布式训练无法自愈）|
| Worker 节点挂了 | 某个 rank 心跳丢失 | 整个任务 FAILED（NCCL 通信断裂不可恢复）|
| 部分节点完成 | 某些 rank 完成但其他还在跑 | 等待全部完成或超时 |

**设计原则：多机任务是原子性的 — 要么全部成功，要么全部失败。**

理由：
1. 分布式训练中各 rank 强耦合（NCCL AllReduce），一个挂了其他都会卡住
2. 部分节点的结果没有统计意义（不完整的 gradient sync）
3. 复杂的部分重试逻辑 ROI 很低，不如直接重跑

**回收时序：**

```
任务 FAILED/COMPLETED
    │
    ├──1. 更新 task_node_allocations 状态
    ├──2. 释放所有 GPU slot (releaseGpuSlots)
    ├──3. 更新节点状态 BUSY → ONLINE（如果没有其他任务）
    ├──4. 更新 task 状态
    └──5. 触发队列中的 QUEUED 任务重调度
```

#### 节点选择算法

```java
/**
 * 为任务选择节点 + GPU 分配方案
 */
public class AllocationPlan {
    List<NodeAllocation> allocations;  // 分配到的节点列表
    DistributedConfig distConfig;     // 分布式配置（多机时）
}

public class NodeAllocation {
    Long nodeId;
    String nodeName;
    String nodeIp;
    List<Integer> gpuIndices;   // 分配的 GPU 编号 [0, 1, 2, 3]
    int nodeRank;               // 在分布式训练中的 rank
}

public class DistributedConfig {
    String masterAddr;          // Master 节点 IP
    int masterPort;             // Master 端口 (default 29500)
    int worldSize;              // 总 GPU 数
    int nprocPerNode;           // 每节点 GPU 数
    String parallelMode;        // "data_parallel" / "tensor_parallel" / "zero"
    String backend;             // "nccl" / "gloo"
}
```

#### 调度器核心逻辑（伪代码）

```java
public AllocationPlan allocate(EvaluationTask task, RunSpec runSpec, ResourcePool pool) {
    
    // 1. 获取池内可用节点
    List<ComputeNode> candidates = getPoolNodes(pool)
        .filter(n -> n.status == ONLINE)
        .filter(n -> chipModelMatches(n.chipModel, task.chipName))  // 硬约束
        .filter(n -> isAgentReachable(n));
    
    // 2. 根据 RunSpec 类型分别处理
    if (pool.provider == "k8s") {
        return allocateK8s(task, runSpec, pool);
    }
    
    if (runSpec.gpuPerNode == 0) {
        // CPU 任务：选一个空闲节点
        return allocateCpuNode(candidates, runSpec);
    }
    
    if (runSpec.nodeCount == 1) {
        // 单机：找一个有足够空闲 GPU 的节点
        ComputeNode node = candidates.stream()
            .filter(n -> getFreeGpuCount(n) >= runSpec.gpuPerNode)
            .min(bySchedulingPolicy(pool.schedulingPolicy))
            .orElse(null);
        
        if (node == null) {
            task.queueReason = String.format(
                "等待 %s 节点（需要 %d 张空闲 GPU，当前最大可用: %d）",
                pool.chipModel, runSpec.gpuPerNode, maxFreeGpu(candidates));
            return null;  // QUEUED
        }
        
        List<Integer> gpus = allocateGpuSlots(node, runSpec.gpuPerNode);
        return new AllocationPlan(List.of(new NodeAllocation(node, gpus, 0)), null);
    }
    
    // 多机：找 N 个有足够 GPU 的节点
    List<ComputeNode> selectedNodes = selectMultipleNodes(
        candidates, runSpec.nodeCount, runSpec.gpuPerNode);
    
    if (selectedNodes.size() < runSpec.nodeCount) {
        task.queueReason = String.format(
            "等待更多 %s 节点（需要 %d 台 × %d 卡，当前满足条件: %d 台）",
            pool.chipModel, runSpec.nodeCount, runSpec.gpuPerNode, selectedNodes.size());
        return null;  // QUEUED
    }
    
    // 生成分布式配置
    DistributedConfig distConfig = new DistributedConfig();
    distConfig.masterAddr = selectedNodes.get(0).ipAddress;
    distConfig.masterPort = 29500;
    distConfig.worldSize = runSpec.nodeCount * runSpec.gpuPerNode;
    distConfig.nprocPerNode = runSpec.gpuPerNode;
    distConfig.parallelMode = runSpec.parallelMode;
    distConfig.backend = "nccl";
    
    List<NodeAllocation> allocations = new ArrayList<>();
    for (int i = 0; i < selectedNodes.size(); i++) {
        ComputeNode node = selectedNodes.get(i);
        List<Integer> gpus = allocateGpuSlots(node, runSpec.gpuPerNode);
        allocations.add(new NodeAllocation(node, gpus, i));
    }
    
    return new AllocationPlan(allocations, distConfig);
}
```

#### K8s 调度

K8s 池使用 K8s 原生调度能力：

```java
public AllocationPlan allocateK8s(EvaluationTask task, RunSpec runSpec, ResourcePool pool) {
    // 生成 K8s Job YAML
    Map<String, Object> jobSpec = new LinkedHashMap<>();
    jobSpec.put("apiVersion", "batch/v1");
    jobSpec.put("kind", "Job");
    
    Map<String, Object> resources = Map.of(
        "limits", Map.of(
            "nvidia.com/gpu", runSpec.gpuPerNode,
            "cpu", runSpec.cpuCores != null ? runSpec.cpuCores : 4,
            "memory", (runSpec.memoryGb != null ? runSpec.memoryGb : 8) + "Gi"
        )
    );
    
    // 多机 K8s 任务 → 用 PyTorchJob (Kubeflow) 或 MPI Operator
    if (runSpec.nodeCount > 1) {
        return allocateK8sDistributed(task, runSpec, pool);
    }
    
    // 单机 K8s 任务 → 普通 Job
    // 提交到 K8s API
    k8sClient.submitJob(pool.clusterId, jobSpec);
    
    return new AllocationPlan(/* K8s 分配，节点由 K8s 决定 */);
}
```

---

### 4.4 Task 生命周期（更新）

```
                    创建
                     │
                     ▼
    ┌─────────── PENDING ──────────┐
    │                              │
    │  调度器尝试分配              │ 超过24h未调度
    │                              │
    ▼                              ▼
  QUEUED ◄──────────────────  CANCELLED
  (带原因)                    (自动取消)
    │
    │  资源就绪
    │
    ▼
  RUNNING ──────────┐
    │               │
    │  成功         │  失败
    ▼               ▼
 COMPLETED       FAILED
    │               │
    │               │  手动重试
    │               └──► QUEUED
    │
    ▼
  生成报告
```

多机任务额外状态：

```
RUNNING
  ├── RUNNING:INITIALIZING    -- 正在启动各节点
  ├── RUNNING:SYNCING         -- 节点间同步中
  ├── RUNNING:EXECUTING       -- 实际执行中
  └── RUNNING:COLLECTING      -- 收集各节点结果
```

---

### 4.5 Agent Execute 协议扩展

#### 单机多卡请求

```json
POST /execute
{
    "taskId": 12345,
    "evalType": "MODEL",
    "params": {
        "model": "GPT-2-Medium",
        "batchSize": 4
    },
    "runSpec": {
        "code": "1n4g",
        "gpuIndices": [0, 1, 2, 3],
        "gpuExclusive": false,
        "parallelMode": "tensor_parallel"
    },
    "chip": {
        "chipId": 450,
        "chipName": "NVIDIA L40S"
    }
}
```

Agent 根据 `runSpec.gpuIndices` 设置 `CUDA_VISIBLE_DEVICES`。

#### 多机请求

```json
POST /execute
{
    "taskId": 12345,
    "evalType": "MODEL",
    "params": { "model": "Llama-7B" },
    "runSpec": {
        "code": "2n8g",
        "gpuIndices": [0, 1, 2, 3, 4, 5, 6, 7],
        "gpuExclusive": true,
        "parallelMode": "zero"
    },
    "distributed": {
        "masterAddr": "192.168.1.10",
        "masterPort": 29500,
        "worldSize": 16,
        "nodeRank": 0,
        "nprocPerNode": 8,
        "backend": "nccl"
    },
    "chip": {
        "chipId": 450,
        "chipName": "NVIDIA L40S"
    }
}
```

Agent 用 `torchrun` 或 `deepspeed` 启动：

```bash
torchrun \
    --nnodes=2 \
    --nproc_per_node=8 \
    --node_rank=0 \
    --master_addr=192.168.1.10 \
    --master_port=29500 \
    benchmark.py
```

---

### 4.6 前端交互设计

#### 创建任务流程（更新步骤 4 和 5）

```
Step 1: 选择芯片        （不变）
Step 2: 选择模板        （不变）
Step 3: 选择评测项      （不变）
Step 4: 运行规格 ← 新增步骤
  ├── 模板推荐默认规格（如算子测试默认"单机单卡"）
  ├── 可手动调整
  ├── 根据芯片类型过滤（CPU 芯片不显示 GPU 选项）
  └── 显示预估资源消耗
Step 5: 选择资源池      ← 原"选择节点"改造
  ├── 按芯片亲和性自动过滤资源池
  ├── 显示池内可用资源（在线节点数、空闲 GPU 数）
  ├── 显示"是否满足运行规格"状态
  ├── K8s 池和 bare-metal 池分组显示
  └── 也可切换到"手动选择节点"（高级模式）
Step 6: 关联资产        （不变）
Step 7: 确认提交        （新增显示运行规格摘要）
```

#### 运行规格选择 UI

```
┌────────────────────────────────────────────┐
│  选择运行规格                                │
│                                              │
│  🔹 推荐规格（基于模板 "芯片快速验证"）        │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ ● 单机单卡│ │ ○ 单机4卡│ │ ○ 单机8卡│    │
│  │ 1 × GPU  │ │ 4 × GPU  │ │ 8 × GPU  │    │
│  │ ~5 分钟  │ │ ~5 分钟  │ │ ~5 分钟  │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  ┌──────────┐ ┌──────────┐                  │
│  │ ○ 2机×8卡│ │ ○ 自定义 │                  │
│  │ 16 GPU   │ │ 高级配置 │                  │
│  │ ~10 分钟 │ │          │                  │
│  └──────────┘ └──────────┘                  │
│                                              │
│  ℹ 当前芯片 NVIDIA L40S 需要 GPU 资源池       │
│                                              │
│  📊 资源预估                                  │
│  ├ GPU 显存需求: ~2 GB                        │
│  ├ 预计耗时: 5 分钟                           │
│  └ 并行模式: 无                               │
└────────────────────────────────────────────┘
```

#### 资源池选择 UI

```
┌────────────────────────────────────────────┐
│  选择资源池                                  │
│                                              │
│  🟢 匹配的资源池（芯片: NVIDIA L40S）         │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │ ● L40S GPU 池                       │    │
│  │   bare-metal · 1 节点在线 · 8 GPU   │    │
│  │   空闲 GPU: 6/8                     │    │
│  │   ✅ 满足运行规格（需要 1 GPU）      │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │ ○ ACK-L40S 弹性池                   │    │
│  │   k8s · ACK 集群 · 2 节点 · 16 GPU  │    │
│  │   ✅ 满足运行规格（K8s 自动调度）     │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  🔴 不匹配的资源池（芯片类型不同，不可选）    │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │ ✕ CPU 计算池                        │    │
│  │   Intel Xeon · 不匹配 NVIDIA L40S   │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  🔧 高级: 手动选择节点 →                      │
└────────────────────────────────────────────┘
```

#### 任务详情 QUEUED 状态

```
┌────────────────────────────────────────────┐
│  任务 PLAN-20260412-001                     │
│                                              │
│  状态: ⏳ 排队中                              │
│                                              │
│  ⚠️ 排队原因:                                 │
│  等待 NVIDIA L40S 节点上线                     │
│  （需要 4 张空闲 GPU，当前最大可用: 2）         │
│                                              │
│  资源池: L40S GPU 池                           │
│  运行规格: 单机 4 卡 (1N×4G)                   │
│  已等待: 3 分 22 秒                            │
│                                              │
│  [取消任务]  [修改运行规格]                     │
│                                              │
│  ⚠️ 修改运行规格将导致评测条件变化，             │
│     结果可能与原规格不可比                       │
└────────────────────────────────────────────┘
```

#### 报告执行环境

```
┌────────────────────────────────────────────┐
│  评测报告 RPT-20260412-001                   │
│                                              │
│  📋 执行环境                                  │
│  ├ 运行规格: 单机 4 卡 (Tensor Parallel)      │
│  ├ 执行节点: gpu-l40s-01 (180.184.249.205)   │
│  ├ 使用 GPU: #0, #1, #2, #3                  │
│  ├ 实际芯片: NVIDIA L40S (48GB) × 4           │
│  ├ 资源池: L40S GPU 池                         │
│  └ 执行时长: 4 分 32 秒                        │
│                                              │
│  📊 评测结果 ...                               │
└────────────────────────────────────────────┘
```

---

### 4.7 数据库 Schema 变更汇总

```sql
-- 1. 新表：运行规格
CREATE TABLE IF NOT EXISTS run_specs ( ... );  -- 见 4.1 节

-- 2. 新表：GPU Slot
CREATE TABLE IF NOT EXISTS gpu_slots ( ... );  -- 见 4.3 节

-- 3. 新表：任务节点分配（多机任务用）
CREATE TABLE IF NOT EXISTS task_node_allocations (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL REFERENCES evaluation_tasks(id),
    node_id         BIGINT NOT NULL REFERENCES compute_nodes(id),
    node_rank       INT NOT NULL DEFAULT 0,
    gpu_indices     INT[],                  -- 分配的 GPU 编号
    status          VARCHAR(16) DEFAULT 'ALLOCATED',  -- ALLOCATED / RUNNING / COMPLETED / FAILED
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    result_summary  JSONB,                  -- 该节点的执行结果摘要
    
    UNIQUE(task_id, node_id)
);

-- 4. 资源池表扩展
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS chip_model VARCHAR(200);
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS provider VARCHAR(32) DEFAULT 'bare-metal';
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS cluster_id BIGINT;
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS gpu_per_node INT;
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS scheduling_policy VARCHAR(32) DEFAULT 'least_loaded';
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS max_concurrent_tasks INT DEFAULT 0;
ALTER TABLE resource_pools ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;

-- 5. 评测任务表扩展
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS run_spec_id BIGINT;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS run_spec_code VARCHAR(64);

-- 6. 评测计划表扩展
ALTER TABLE evaluation_plans ADD COLUMN IF NOT EXISTS run_spec_id BIGINT;

-- 7. 报告表扩展（已在芯片亲和性迭代中加了部分字段）
ALTER TABLE chip_reports ADD COLUMN IF NOT EXISTS run_spec_code VARCHAR(64);
ALTER TABLE chip_reports ADD COLUMN IF NOT EXISTS gpu_indices INT[];
ALTER TABLE chip_reports ADD COLUMN IF NOT EXISTS gpu_count INT;
ALTER TABLE chip_reports ADD COLUMN IF NOT EXISTS node_count INT;
ALTER TABLE chip_reports ADD COLUMN IF NOT EXISTS parallel_mode VARCHAR(32);
```

---

### 4.8 API 接口设计

#### RunSpec 接口

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/run-specs | 列表（支持 category 过滤） |
| GET | /api/run-specs/{id} | 详情 |
| POST | /api/run-specs | 创建自定义规格（admin） |
| PUT | /api/run-specs/{id} | 更新（admin） |
| DELETE | /api/run-specs/{id} | 删除（admin，仅自定义） |

#### ResourcePool 接口（扩展）

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/resource-pools | 列表（新增 chipModel、provider 过滤） |
| GET | /api/resource-pools/{id}/availability | 实时可用资源（空闲 GPU 数等） |
| POST | /api/resource-pools/{id}/check-runspec | 检查是否满足指定运行规格 |

#### GPU Slot 接口

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/nodes/{id}/gpu-slots | 查看节点 GPU 使用情况 |
| GET | /api/gpu-slots/summary | GPU 全局使用概览 |

#### 任务扩展

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/tasks/{id}/allocations | 查看多机任务的节点分配详情 |

---

## 五、实现优先级与里程碑

### Phase 1：基础设施（1-2 周）
- [x] 节点 chipModel 字段 + Agent 自动上报
- [x] 芯片亲和性硬约束调度
- [x] QUEUED 状态带原因
- [x] 报告标注执行环境
- [ ] RunSpec 表 + CRUD API + 系统预置
- [ ] 资源池 chipModel/provider 字段扩展
- [ ] 前端运行规格选择步骤

### Phase 2：单机多卡（1-2 周）
- [ ] GPU Slot 表 + 管理逻辑
- [ ] Agent 上报 GPU 列表（nvidia-smi）
- [ ] 调度器支持单机多 GPU 分配
- [ ] Agent /execute 支持 CUDA_VISIBLE_DEVICES
- [ ] 前端显示 GPU 使用情况

### Phase 3：多机多卡（2-3 周）
- [ ] task_node_allocations 表
- [ ] 调度器支持多节点选择 + 分布式配置生成
- [ ] Agent 支持 torchrun/deepspeed 分布式启动
- [ ] 多节点结果汇聚 + 报告合成
- [ ] 前端多机任务监控视图

### Phase 4：K8s 调度集成（2-3 周）
- [ ] K8s 池通过 K8s API 提交 Job/PyTorchJob
- [ ] K8s Pod 完成回调机制
- [ ] K8s GPU 资源自动发现
- [ ] K8s 弹性伸缩集成

---

## 六、风险与注意事项

1. **向后兼容** — 现有的"单机单卡"评测不应受影响，RunSpec 默认 1N×1G
2. **GPU 计数准确性** — 依赖 Agent 上报的 nvidia-smi 数据，需要容错处理
3. **多机网络** — 分布式训练对网络延迟敏感，NCCL 需要节点间高速互联
4. **GPU 碎片** — 一个 8 卡节点被分配了 3 个单卡任务，只剩 5 卡，无法满足 8 卡需求。需要 defrag 策略或 pack 调度
5. **故障恢复** — 多机任务中某个节点掉线，整个任务如何处理（重试 vs 失败）
6. **K8s 差异** — 不同 K8s 集群的 GPU 插件（nvidia-device-plugin）版本可能不同

---

## 七、附录：现有数据模型参考

### 现有 compute_nodes 表（45 列，含本次新增）
关键字段：id, name, ip_address, agent_port, hardware_info(JSON), status, tags, chip_model, resource_pool_id, cluster_id, source

### 现有 evaluation_tasks 表
关键字段：id, task_no, name, eval_type, status, eval_config(JSON), resource_pool_id, assigned_node_id, chip_id, plan_id, queue_reason

### 现有 resource_pools 表
关键字段：id, name, type, description, capacity(JSON), status
