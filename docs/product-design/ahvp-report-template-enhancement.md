# AHVP 评测报告模板增强设计

> **文档版本:** v1.2
> **创建日期:** 2026-04-13
> **更新日期:** 2026-04-15
> **变更记录:**
> - v1.2 (2026-04-15): **产品决策变更** — 评分/对比（vs L40S 百分比、雷达图、综合评价）从单个报告移到独立的「评测报告对比」功能；单个报告模板仅包含原始测试数据
> - v1.1 (2026-04-14): 初版报告模板增强设计
> **基于:** evaluation-module-redesign-v2.md 第五部分 + 行业对标研究
> **目标:** 完善训练和推理评测报告的数据展示、对比维度和可视化方案

---

## 一、当前问题

v2 设计文档中报告页面(5.4 节)仅做了模块级大纲:
- 只有"模型评测结果"一个笼统的表,未区分**训练**和**推理**
- 缺少**多模型横评**视角(如同时对比 DeepSeek-R1-671B / Qwen3-235B / DeepSeek-70B)
- 缺少**多输入输出配置**维度(如 128/1024、1024/8192、2048/2048 等 token 组合)
- 缺少**Decode / Prefill 分离展示**(推理场景的关键指标)
- 缺少**芯片间横向对比**和**梯队划分**
- 缺少**产品路线图**和**纸面规格 vs 实测性能**的关联分析

以下设计参考行业实际评测报告(含产品硬件规格对比、训练吞吐对比、推理多模型横评、单芯片详细 Benchmark 等),充分补齐这些缺失。

---

## 二、报告整体结构(增强版)

```
评测报告
├── 0. 报告封面与元数据
├── ★ 1. 一页纸摘要(Executive Summary)       ← 默认展开
├── 2. 芯片硬件规格概览                         ← 默认折叠
│   ├── 2.1 目标芯片规格卡片
│   ├── 2.2 竞品规格对比表
│   └── 2.3 下一代产品路线图(可选)
├── 3. 芯片基础性能(Layer 1)                     ← 默认折叠
│   ├── 3.1 实测算力 vs 标称算力
│   ├── 3.2 内存带宽
│   ├── 3.3 互联带宽
│   ├── 3.4 功耗与能效
│   └── 3.5 NCCL 通信性能测试(机内 AllReduce)
├── 4. 算子评测结果(Layer 2)                     ← 默认折叠
│   ├── 4.1 精度测试概览
│   └── 4.2 性能测试排行
├── 5. 训练性能评测(Layer 5 - Training)         ← 默认折叠
│   ├── 5.1 训练性能摘要
│   ├── 5.2 分模型训练吞吐对比
│   ├── 5.3 多卡扩展性分析
│   └── 5.4 训练稳定性与收敛性
├── 6. 推理性能评测(Layer 5 - Inference)         ← 默认折叠
│   ├── 6.1 推理性能摘要
│   ├── 6.2 多模型横评
│   ├── 6.3 输入输出配置矩阵
│   ├── 6.4 Decode / Prefill 详细分析
│   ├── 6.5 并发性能与 SLA 达标率
│   └── 6.6 多模态推理(可选)
├── 7. 能效分析(Tokens/Watt)                      ★ 新增
│   ├── 7.1 单卡能效比对比
│   ├── 7.2 多卡能效比对比
│   └── 7.3 TCO 参考估算
├── ~~8. 综合评价~~                                  ← ★ v1.2: 移到「评测报告对比」功能
│   ├── ~~8.1 综合能力概览(vs 可配置基准芯片)~~
│   ├── ~~8.2 分段详细结论~~
│   ├── ~~8.3 适用场景评估~~
│   └── ~~8.4 瓶颈分析与优化建议~~  → 瓶颈分析保留在单报告（基于原始数据）
├── 9. 历史趋势对比(同芯片多次评测)              ★ 新增
├── 10. 评测环境与方法论
└── 附录

【展示规则】
- 报告默认仅展开「一页纸摘要」,其余模块折叠
- 用户可点击展开任意模块查看详情(渐进式披露)
- 支持「展开全部」一键操作
```

---

## 三、全局配置

### 基准芯片配置

> **基准芯片不硬编码**,通过评测报告配置指定,支持多基准对比。

```json
// ChipReport.baseline_config
{
  "primary_baseline": "NVIDIA_L40S",          // 主基准芯片(必填)
  "secondary_baselines": ["NVIDIA_A100", "NVIDIA_H200"],  // 辅助对标(可选)
  "baseline_display_mode": "primary_only"      // primary_only | all_baselines
}
```

- **主基准** 用于所有百分比计算和颜色标记
- **辅助对标** 在备注列或展开详情时显示
- 当主基准无该项测试数据时,自动 fallback 到辅助对标

### 模型列表与芯片规格联动

> **根据被测芯片显存容量自动过滤不可测模型**,避免无效测试。

```json
// 模型显存需求配置(各量化下的最低显存需求)
{
  "model_memory_requirements": [
    {"model": "Llama2-7B",        "fp16_gb": 14,  "int8_gb": 8,   "int4_gb": 5},
    {"model": "Llama2-70B",       "fp16_gb": 140, "int8_gb": 75,  "int4_gb": 40},
    {"model": "DeepSeek-R1-671B", "fp16_gb": 1342, "int8_gb": 671, "int4_gb": 336},
    {"model": "Qwen3-235B",      "fp16_gb": 470, "int8_gb": 235, "int4_gb": 118}
  ]
}
```

**联动逻辑:**
- 芯片显存 < 模型最低需求 → 自动排除,标记为「显存不足,无法测试」
- 多卡场景按「单卡显存 × 卡数」计算可用显存(考虑并行开销,乘以 0.85 系数)
- 生成报告时自动标注每个模型的可测性状态

### 「测不了」处理机制

> 硬件限制、软件不兼容、环境问题等导致无法执行的测试项,必须明确标注而非留空。

**状态枚举:**

| 状态 | 含义 | 显示 | 示例 |
|------|------|------|------|
| `tested` | 已完成测试 | 正常显示数据 | 135% |
| `not_applicable` | 硬件不支持 | 灰色 + 原因 | 「N/A: 显存不足 (80GB < 140GB)」 |
| `not_supported` | 软件栈不支持 | 灰色 + 原因 | 「N/A: 未适配 vLLM」 |
| `failed` | 测试失败 | 红色 + 原因 | 「FAIL: CUDA OOM」 |
| `pending` | 待测试 | 虚线框 | 「待测试」 |

```json
// 测试结果状态字段
{
  "status": "not_applicable",
  "reason": "显存不足",
  "detail": "单卡 80GB < Llama2-70B FP16 最低需求 140GB",
  "skip_in_summary": true    // 摘要中不计入平均值
}
```

---

## 四、各模块详细设计

### 1. 一页纸摘要(Executive Summary)

> 报告打开后默认只显示这一页,包含所有核心结论。

| 内容 | 说明 |
|------|------|
| 被测芯片信息 | 芯片名 + 厂商 + 核心规格(3-4 项) |
| 基准芯片 | 当前报告的主基准芯片名称 |
| 训练性能摘要 | vs 基准平均百分比 + 最优/最弱模型 |
| 推理性能摘要 | vs 基准平均百分比 + 最优/最弱场景 |
| 能效摘要 | Tokens/Watt 训练 + 推理 vs 基准 |
| NCCL 通信 | 峰值 busbw vs 基准 |
| 不可测项统计 | N 项因硬件限制未测试(点击展开查看详情) |
| 关键结论 | 2-3 句核心结论 + 主要瓶颈 |
| 历史趋势 | 与上次评测的关键指标变化(如有) |

### 2. 芯片硬件规格概览

#### 2.1 目标芯片规格卡片

以卡片形式展示被测芯片的核心参数:

| 字段 | 示例值 | 数据来源 |
|------|--------|---------|
| 芯片名称 | 摩尔线程 S5000 | 芯片档案 |
| 厂商 | 摩尔线程 | 芯片档案 |
| 架构 | MUSA 3.0 | 芯片档案 |
| 量产状态 | 已量产 | 芯片档案 |
| FP64 TFLOPS | 支持 | 芯片档案 specs |
| FP32 TFLOPS | 256 | 芯片档案 specs |
| FP16 TFLOPS | 512 | 芯片档案 specs |
| FP8 TFLOPS | 1024 | 芯片档案 specs |
| INT8 TOPS | - | 芯片档案 specs |
| 显存容量 | 80 GB | 芯片档案 specs |
| 显存类型 | GDDR6 | 芯片档案 specs |
| 显存带宽 | 1.6 TB/s | 芯片档案 specs |
| 互联带宽 | 800 GB/s | 芯片档案 specs |
| TDP | 450 W | 芯片档案 specs |

#### 2.2 竞品规格对比表

横向对比被测芯片与基准芯片、其他国产芯片:

| 字段 | 被测芯片 | NVIDIA A100 | NVIDIA H200 | 华为 910C | ... |
|------|---------|-------------|-------------|-----------|-----|
| FP16 TFLOPS | - | 312 | 989.5 | 780 | ... |
| 显存 (GB) | - | 80 | 141 | 128 | ... |
| 显存带宽 (TB/s) | - | 2.0 | 4.8 | 3.2 | ... |
| 互联带宽 (GB/s) | - | 600 | 900 | 700 | ... |

**可视化方案:**
- 分组柱状图:多芯片多指标对比
- 被测芯片高亮突出

**数据模型扩展:**

```json
// Chip.specs 扩展字段
{
  "fp64_tflops": null,
  "fp32_tflops": 256,
  "tf32_tflops": null,
  "fp16_tflops": 512,
  "bf16_tflops": null,
  "fp8_tflops": 1024,
  "fp4_tflops": null,
  "int8_tops": null,
  "memory_gb": 80,
  "memory_type": "GDDR6",        // HBM2e / HBM3 / HBM3e / GDDR6
  "memory_bandwidth_tbps": 1.6,
  "interconnect_bandwidth_gbps": 800,
  "interconnect_type": "MUSA Link",  // NVLink / MUSA Link / HiLink 等
  "tdp_watts": 450,
  "process_node": "7nm",
  "mass_production_status": "mass_production",  // mass_production / small_batch / sampling / announced
  "launch_date": "2025-Q2",
  "supported_precisions": ["FP64", "FP32", "FP16", "BF16", "FP8"]
}
```

---

### 3.5 NCCL 通信性能测试(机内 AllReduce) ★ 新增

> 基于 [NVIDIA nccl-tests](https://github.com/NVIDIA/nccl-tests),评测机内多卡集合通信性能。
> 对于非 NVIDIA 芯片,使用对应的通信库测试工具(如 MCCL-tests、HCCL-tests),指标定义保持一致。

#### 测试方法

**标准测试命令:**

```bash
# 机内 8 卡 AllReduce,消息大小从 8B 扫描到 8GB,每次翴倍
./build/all_reduce_perf -b 8 -e 8G -f 2 -g 8 -n 20 -w 5

# MPI 模式(单机 8 卡)
mpirun --allow-run-as-root -bind-to none -map-by slot \
  all_reduce_perf_mpi -b 2048M -e 8192M -f 2 -g 1
```

> 参考:[NVIDIA nccl-tests](https://github.com/NVIDIA/nccl-tests);[SenseCore ACP nccl-test 最佳实践](https://www.sensecore.cn/help/docs/cloud-foundation/compute/acp/acpBestPractices/Job-nccl_test)

**网络环境变量(RoCE v2 400G 场景):**

```bash
export NCCL_IB_GID_INDEX=5
export NCCL_IB_TC=138
export NCCL_IB_QPS_PER_CONNECTION=8
# 基线测试可设置更高并发度(实际训练中需根据计算/通信资源平衡调整)
export NCCL_MIN_NCHANNELS=32
```

**测试参数说明:**

| 参数 | 值 | 说明 |
|------|------|------|
| 消息大小范围 | 8B ~ 8GB | 覆盖小消息延迟和大消息带宽场景 |
| 步进方式 | ×2 (factor=2) | 对数均匀扫描 |
| GPU/NPU 数量 | 8 或 16 (机内全卡) | 测试机内全卡互联带宽 |
| 迭代次数 | 20 | 确保结果稳定 |
| 预热迭代 | 5 | 排除冷启动影响 |
| 数据类型 | float (FP32) | 默认,可额外测试 fp16/bf16 |
| 操作 | AllReduce (Sum) | 训练场景最关键的集合通信 |

#### 核心指标

| 指标 | 定义 | 说明 |
|------|------|------|
| **Bus Bandwidth (busbw)** | `algbw × 2×(n-1)/n` | ⭐ **核心指标**,反映硬件互联带宽的实际利用率,可直接与硬件峰值带宽对比 |
| Algorithm Bandwidth (algbw) | `S / t` | 算法带宽,会随 GPU 数量变化,不宜直接对比 |
| Latency | 操作时间 (ms) | 小消息场景的延迟,反映通信库启动开销 |
| 带宽利用率 | busbw / 硬件峰值带宽 | 衡量通信库优化程度 |

> i️ **为什么用 Bus Bandwidth**:AllReduce 的算法带宽会随卡数增加而下降,而 Bus Bandwidth 经过校正后可以直接与硬件峰值对比,独立于 GPU 数量。参考 [NCCL Tests PERFORMANCE.md](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md)。

#### 测试项目

| 测试项 | 优先级 | 场景 | 命令 |
|---------|:---:|------|------|
| **AllReduce** | 必测 | 训练梯度同步,最关键的集合通信 | `all_reduce_perf` |
| **AlltoAll** | 建议 | MoE 模型的 Expert Parallel | `alltoall_perf` |
| **AllGather** | 可选 | 模型并行参数收集 | `all_gather_perf` |
| **ReduceScatter** | 可选 | ZeRO 优化器状态分割 | `reduce_scatter_perf` |

#### 结果展示

**摘要卡片(AllReduce 为主):**

> **★ v1.2 变更（2026-04-15）：** 单个报告仅展示被测芯片数据列。L40S 和 vs L40S 列移到对比功能。

| 指标 | 被测芯片 | ~~L40S (基准)~~ | ~~**vs L40S**~~ |
|------|---------|-----------|:---:|
| 峰值 Bus Bandwidth (GB/s) | - | - | -% |
| 小消息延迟 (8B~1KB, μs) | - | - | -% |
| 带宽利用率 (busbw / 硬件峰值) | -% | -% | - |
| AlltoAll 峰值 busbw (GB/s) | - | - | -% |

**详细结果表(关键消息大小点):**

> **★ v1.2 变更（2026-04-15）：** 单个报告保留被测芯片 busbw 和延迟。L40S 和 vs L40S 列移到对比功能。

| 消息大小 | 被测芯片 busbw (GB/s) | ~~L40S busbw (GB/s)~~ | ~~**vs L40S**~~ | 延迟 (ms) | 备注 |
|---------|:---:|:---:|:---:|:---:|------|
| 8 B | - | - | -% | - | 小消息延迟 |
| 1 KB | - | - | -% | - | |
| 1 MB | - | - | -% | - | |
| 32 MB | - | - | -% | - | |
| 256 MB | - | - | -% | - | |
| 1 GB | - | - | -% | - | 大消息峰值带宽 |
| 8 GB | - | - | -% | - | |

**可视化方案:**
1. **带宽-消息大小曲线图**:X 轴=消息大小(对数坐标),Y 轴=Bus Bandwidth (GB/s),多芯片叠加对比
2. **带宽利用率柱状图**:峰值 busbw 占硬件理论峰值的比例

#### 数据模型

```json
// EvaluationResult.result_data NCCL 通信测试结果
{
  "result_type": "nccl_allreduce",
  "test_tool": "nccl-tests",           // nccl-tests / mccl-tests / hccl-tests
  "comm_library": "NCCL 2.21.5",       // 通信库版本
  "num_gpus": 8,
  "scope": "intra_node",               // intra_node / inter_node
  "datatype": "float",
  "operation": "allreduce_sum",
  "iterations": 20,
  "warmup_iterations": 5,
  "results": [
    {
      "message_size_bytes": 8,
      "algbw_gbps": 0.01,
      "busbw_gbps": 0.02,
      "latency_us": 25.3
    },
    {
      "message_size_bytes": 1073741824,   // 1 GB
      "algbw_gbps": 280.5,
      "busbw_gbps": 490.8,
      "latency_us": 3820
    }
  ],
  "summary": {
    "peak_busbw_gbps": 490.8,
    "peak_message_size_bytes": 1073741824,
    "small_msg_latency_us": 25.3,        // 8B 消息延迟
    "hw_peak_bandwidth_gbps": 800,       // 硬件峰值带宽
    "bandwidth_utilization": 0.614        // 490.8 / 800
  },
  "baseline_comparison": {
    "baseline_chip": "NVIDIA_L40S",
    "baseline_peak_busbw_gbps": 440.2,
    "vs_baseline_peak_busbw": 1.115,     // 490.8 / 440.2
    "baseline_small_msg_latency_us": 22.1,
    "vs_baseline_latency": 1.145         // 25.3 / 22.1 (越小越好,>1 表示更慢)
  }
}
```

---

### 5. 训练性能评测(★ 新增模块)

#### 5.1 训练性能摘要

> **★ v1.2 变更（2026-04-15）：** 训练性能摘要在单个报告中仅展示 **原始吞吐数据**。vs L40S 百分比、最优/最弱模型的百分比比较移到「评测报告对比」功能中展示。

> **基准芯片 = 100%**(默认 L40S,可在报告配置中切换),所有性能值均以基准芯片实测值换算百分比。 *(★ v1.2: 此百分比呈现方式仅在对比功能中使用)*

以摘要卡片形式展示核心指标,不做主观打分:

| 指标 | 说明 | 呈现方式 |
|------|------|----------|
| vs L40S 平均训练性能 | 所有模型训练吞吐的几何平均比值 | **百分比**(如 135% = 比 L40S 快 35%) |
| 最优模型 | 相对 L40S 性能比最高的模型 | 模型名 + 百分比 |
| 最弱模型 | 相对 L40S 性能比最低的模型 | 模型名 + 百分比 |
| 关键瓶颈 | 自动诊断的主要性能瓶颈 | 文字描述 |

**颜色规则:** ≥100% 绿色(持平或超越基准),80%-99% 黄色(接近基准),<80% 红色(显著落后)

#### 5.2 分模型训练吞吐对比

**关键指标:** Tokens/s/GPU(大模型)或 Samples/s/GPU(传统模型)

**参考行业对标维度:**

> **★ v1.2 变更（2026-04-15）：** 单个报告仅保留「被测芯片 Tokens/s/GPU」列。L40S 和 vs L40S 列移到对比功能。

| 模型 | 模型规模 | 被测芯片 Tokens/s/GPU | ~~L40S (基准)~~ | ~~**vs L40S**~~ | 备注 |
|------|---------|:---:|:---:|:---:|------|
| Llama2-7B | 7B | - | - | -% | |
| Llama2-70B | 70B | - | - | -% | |
| Qwen3-8B | 8B | - | - | -% | |
| Qwen3-72B | 72B | - | - | -% | |
| DeepSeek-R1-7B | 7B | - | - | -% | |
| GPT-J-6B | 6B | - | - | -% | |

> 如有其他对标芯片(A100、H200 等),在备注列注明或以附加列展示。

**可视化方案:**
1. **分组柱状图**(参考图3样式):X 轴=模型,Y 轴=Tokens/s/GPU,不同芯片用不同颜色
2. **性能比值热力图**:每个模型 × 每个芯片的 vs 基准比值,颜色深浅表示性能

**数据模型:**

```json
// EvaluationResult.result_data 训练结果
{
  "result_type": "model_training",
  "model_name": "Llama2-7B",
  "model_size": "7B",
  "task_type": "pre_training",
  "metrics": {
    "throughput_tokens_per_sec_per_gpu": 10000,
    "throughput_samples_per_sec": null,
    "time_to_train_seconds": 3600,
    "final_loss": 2.15,
    "convergence_epoch": 3,
    "loss_cosine_similarity": 0.998,
    "memory_peak_mb": 65000,
    "gpu_utilization_avg": 0.85,
    "power_avg_watts": 380
  },
  "training_config": {
    "num_gpus": 1,
    "batch_size": 32,
    "micro_batch_size": 4,
    "gradient_accumulation_steps": 8,
    "optimizer": "AdamW",
    "learning_rate": 0.0001,
    "parallel_strategy": "none",
    "mixed_precision": "bf16",
    "max_steps": 1000
  },
  "baseline_comparison": {
    "baseline_chip": "NVIDIA_L40S",
    "baseline_throughput": 7400,
    "vs_baseline_ratio": 1.35
  }
}
```

#### 5.3 多卡扩展性分析

| 卡数 | 被测芯片 Tokens/s | 理想线性扩展 | 实际扩展效率 | L40S 扩展效率 |
|:---:|:---:|:---:|:---:|:---:|
| 1 | - | - | 100% | 100% |
| 2 | - | - | -% | -% |
| 4 | - | - | -% | -% |
| 8 | - | - | -% | -% |

**可视化:** 折线图,X=卡数,Y=吞吐,虚线=理想线性,实线=实际

#### 5.4 训练稳定性与收敛性

| 指标 | 说明 |
|------|------|
| Loss 收敛曲线 | 与基准芯片的 loss 曲线对比,验证训练等价性 |
| Loss Cosine Similarity | 与基准芯片的 loss 序列余弦相似度(>0.99 为 PASS) |
| 梯度一致性 | 前 N 步梯度与基准的余弦相似度 |
| 长时间训练稳定性 | 无 NaN/Inf、无性能退化 |

---

### 6. 推理性能评测(★ 新增模块)

#### 6.1 推理性能摘要

> **★ v1.2 变更（2026-04-15）：** 推理性能摘要在单个报告中仅展示 **原始性能数据**（TGS、延迟等）。vs L40S 百分比移到「评测报告对比」功能。

> **基准芯片 = 100%**(同训练模块,可配置) *(★ v1.2: 此百分比呈现方式仅在对比功能中使用)*

| 指标 | 说明 | 呈现方式 |
|------|------|----------|
| vs L40S 平均推理性能 | 所有模型/配置的 Output TGS 几何平均比值 | **百分比** |
| 最优场景 | 相对 L40S 性能比最高的模型+配置 | 模型名 + 配置 + 百分比 |
| 最弱场景 | 相对 L40S 性能比最低的模型+配置 | 模型名 + 配置 + 百分比 |
| Decode vs Prefill 倾向 | Decode 和 Prefill 哪个相对更强/更弱 | 文字描述 |
| SLA 达标率 | 满足延迟约束的配置占比 | 百分比 |

**颜色规则同训练模块。**

#### 6.2 多模型横评

**参考行业对标(图4 样式),多模型并排对比:**

**模型列表(推荐):**

| 模型 | 规模 | 场景 | 量化 | 说明 |
|------|------|------|------|------|
| DeepSeek-R1-671B | 671B | 推理 | INT8 | 超大模型,考验显存和带宽 |
| DeepSeek-V3-70B | 70B | 推理 | FP16/INT8 | 中等规模主流模型 |
| Qwen3-235B | 235B | 推理 | INT8 | 国产大模型代表 |
| Qwen3-vl-235B | 235B | 多模态推理 | INT8 | 图文理解场景 |
| Llama3-8B | 8B | 推理 | FP16 | 小模型基准 |
| Llama3-70B | 70B | 推理 | FP16/INT8 | 通用大模型基准 |

**每个模型的标准输入输出配置矩阵(参考图4/图5 样式):**

| 配置编号 | 输入 Tokens | 输出 Tokens | 场景描述 |
|---------|:---:|:---:|------|
| C1 | 128 | 1024 | 短问题长回答(日常对话) |
| C2 | 1024 | 1024 | 中等输入等长回答 |
| C3 | 1024 | 8192 | 中等输入超长回答(文章生成) |
| C4 | 2048 | 2048 | 等长中等序列 |
| C5 | 8192 | 1024 | 长文档短摘要 |
| C6 | 16000~20000 | 300~500 | 超长上下文短回答 |
| C7 | 3000~3600 | 300~500 | 中长输入短回答 |

#### 6.3 输入输出配置矩阵

每个模型 × 每个配置的综合结果表:

> **★ v1.2 变更（2026-04-15）：** 单个报告仅保留「被测芯片 Output TGS」列。L40S 和 vs L40S 列移到对比功能。

| 模型 | 配置 | 被测芯片 Output TGS | ~~L40S (基准)~~ | ~~**vs L40S**~~ | 备注 |
|------|------|:---:|:---:|:---:|------|
| DeepSeek-R1-671B-int8 | C1 (128/1024) | - | - | -% | |
| DeepSeek-R1-671B-int8 | C5 (8192/1024) | - | - | -% | |
| Qwen3-235B | C1 (128/1024) | - | - | -% | |
| ... | ... | ... | ... | ... | ... |

**可视化方案:**
1. **分组柱状图**(每个模型一张子图):X=配置,Y=TGS,不同芯片不同颜色
2. **热力图**:模型 × 配置的性能比值矩阵
3. ~~**雷达图**:每个芯片在不同模型上的相对表现~~ *(★ v1.2: 雷达图移到对比功能)*

#### 6.4 Decode / Prefill 详细分析

**参考图5(S5000 vs H200 Qwen3-8B 数据)**,推理性能需要拆分为两个阶段:

| 阶段 | 含义 | 关键指标 |
|------|------|---------|
| **Prefill** | 处理输入 tokens(计算密集) | Prefill TGS (tokens/s)、Prefill 延迟 (ms) |
| **Decode** | 逐 token 生成输出(访存密集) | Decode TGS (tokens/s)、TPOT (ms/token) |

**详细结果表(每个模型一张):**

> **★ v1.2 变更（2026-04-15）：** 单个报告仅展示被测芯片 Decode/Prefill TGS。L40S 和 vs L40S 列移到对比功能。

| 输入/输出 | 约束条件 | 被测芯片 Decode TGS | ~~L40S Decode TGS~~ | ~~**vs L40S**~~ | 被测芯片 Prefill TGS | ~~L40S Prefill TGS~~ | ~~**vs L40S**~~ |
|-----------|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| 3.0~3.6k / 0.3~0.5k | prefill<3000ms, decode<50ms | - | - | -% | - | - | -% |
| 16~20k / 0.3~0.5k | decode<50ms | - | - | -% | - | - | -% |
| 0.8~1k / 1.6~2k | prefill<3000ms, decode<50ms | - | - | -% | - | - | -% |
| 3.6~4k / 1.6~2k | prefill<3000ms, decode<50ms | - | - | -% | - | - | -% |
| 11~15k / 2.5~2.9k | prefill<3000ms, decode<50ms | - | - | -% | - | - | -% |

**约束条件说明:**
- `prefill < 3000ms`:首 token 延迟不超过 3 秒
- `decode < 50ms`:单 token 生成延迟不超过 50ms
- 不满足约束的数据点标记为 "SLA Fail"

**可视化方案:**
1. **双 Y 轴柱状图**:左 Y=Decode TGS,右 Y=Prefill TGS
2. **散点图**:X=Prefill TGS,Y=Decode TGS,每个点代表一个配置,气泡大小=输入长度

**数据模型:**

```json
// EvaluationResult.result_data 推理结果
{
  "result_type": "model_inference",
  "model_name": "Qwen3-8B",
  "model_size": "8B",
  "quantization": "FP16",
  "inference_config": {
    "input_tokens_range": [3000, 3600],
    "output_tokens_range": [300, 500],
    "config_label": "C7",
    "batch_size": 1,
    "num_gpus": 1,
    "inference_engine": "vLLM",
    "constraints": {
      "max_prefill_latency_ms": 3000,
      "max_decode_latency_ms": 50
    }
  },
  "metrics": {
    "decode_tgs": 1109.3,          // Decode Token Generation Speed (tokens/s)
    "prefill_tgs": 9657.3,         // Prefill Token Generation Speed (tokens/s)
    "ttft_ms": 450,                // Time to First Token (ms)
    "tpot_ms": 0.9,               // Time Per Output Token (ms)
    "total_latency_ms": 1200,
    "output_tokens_per_sec": 1109.3,
    "memory_peak_mb": 18000,
    "gpu_utilization_avg": 0.92,
    "power_avg_watts": 350,
    "sla_pass": true
  },
  "baseline_comparison": {   // ★ v1.2: 此字段仅在对比功能中使用
    "baseline_chip": "NVIDIA_L40S",
    "baseline_decode_tgs": 1320.5,
    "baseline_prefill_tgs": 11200.0,
    "decode_vs_baseline": 0.84,
    "prefill_vs_baseline": 0.86
  }
}
```

#### 6.5 并发性能与 SLA 达标率

> **★ v1.2 变更（2026-04-15）：** 单个报告保留被测芯片 QPS、P99、SLA 达标率。L40S QPS 和 vs L40S 列移到对比功能。

| 并发数 | 被测芯片 QPS | ~~L40S QPS~~ | ~~**vs L40S**~~ | P99 延迟 (ms) | SLA 达标率 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | - | - | -% | - | -% |
| 4 | - | - | -% | - | -% |
| 8 | - | - | -% | - | -% |
| 16 | - | - | -% | - | -% |
| 32 | - | - | -% | - | -% |

**SLA 标准(对齐 MLPerf):**
- TTFT ≤ 2000ms
- TPOT ≤ 200ms
- 错误率 < 1%

#### 6.6 多模态推理(可选)

针对 Vision-Language 模型(如 Qwen3-vl-235B):

| 输入 | 被测芯片 TGS | 基准 TGS | 比值 |
|------|:---:|:---:|:---:|
| 1920×1080 图片 + 1024 tokens | - | - | -% |
| 1280×720 图片 + 2048 tokens | - | - | -% |
| 4K 图片 + 512 tokens | - | - | -% |

---

### 7. 能效分析(Tokens/Watt) ★ 新增

> 国产芯片客户非常关注 TCO,能效比作为独立维度呈现。

#### 7.1 单卡能效比对比

| 场景 | 指标 | 被测芯片 | 基准芯片 | **vs 基准** |
|------|------|---------|---------|:---:|
| 7B 训练 | Training Tokens/s/Watt | - | - | -% |
| 70B 训练 | Training Tokens/s/Watt | - | - | -% |
| 7B 推理 (C1) | Inference Tokens/s/Watt | - | - | -% |
| 70B 推理 (C1) | Inference Tokens/s/Watt | - | - | -% |

**计算方式:**
- 训练:`Tokens/s/GPU ÷ 实测平均功耗 (W)`
- 推理:`Output TGS ÷ 实测平均功耗 (W)`
- 功耗数据来源:评测过程中实时采集的 GPU 功耗均值

#### 7.2 多卡能效比对比

| 卡数 | 被测芯片 总功耗 (W) | 基准 总功耗 (W) | 被测 Tokens/Watt | 基准 Tokens/Watt | **vs 基准** |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | - | - | - | - | -% |
| 8 | - | - | - | - | -% |

#### 7.3 TCO 参考估算

| 指标 | 被测芯片 | 基准芯片 | 说明 |
|------|---------|---------|------|
| 单卡 TDP (W) | - | - | 标称功耗 |
| 实测平均功耗 (W) | - | - | 训练场景 |
| 等效算力单位电费 | - 元/TFLOPS·h | - 元/TFLOPS·h | 按 0.8 元/kWh 估算 |
| 等效推理单位电费 | - 元/M Tokens | - 元/M Tokens | 基于实测 TGS + 功耗 |

**数据模型:**

```json
// EvaluationResult.result_data 能效指标
{
  "power_metrics": {
    "tdp_watts": 450,
    "avg_power_watts": 380,          // 实测平均功耗
    "peak_power_watts": 420,
    "training_tokens_per_watt": 26.3, // Tokens/s/GPU ÷ avg_power
    "inference_tokens_per_watt": 2.92,
    "cost_per_tflops_hour": 0.12,    // 元/TFLOPS·h
    "cost_per_m_tokens": 0.45        // 元/M Tokens
  }
}
```

---

### 8. 综合评价

> **★ v1.2 变更（2026-04-15）：** 整个 Section 8（综合评价）从单个报告模板中移除，移到独立的「评测报告对比」功能中实现。以下 8.1-8.4 的设计内容保留，作为对比功能的设计参考。

#### 8.1 综合能力概览(vs 可配置基准芯片) *(★ v1.2: 在对比功能中展示)*

> **不做主观打分**,所有维度均以 vs 基准芯片百分比呈现。

以九维度百分比表格呈现(可选配雷达图):

| 维度 | 计算方式 | vs 基准 | 说明 |
|------|---------|:---:|------|
| 算力 | 实测 TFLOPS / 基准实测 | -% | |
| 访存 | 实测带宽 / 基准实测 | -% | |
| 通信 | NCCL busbw / 基准 busbw | -% | |
| 算子 | 精度通过率 × 性能均值 / 基准 | -% | |
| 训练 | 训练吞吐几何平均 / 基准 | -% | |
| 推理 | 推理 TGS 几何平均 / 基准 | -% | |
| 扩展性 | 8卡扩展效率 / 基准 | -% | |
| **能效** | Tokens/Watt / 基准 | -% | ★ 新增 |
| 生态 | 框架兼容性 + 量化支持 | -% | 定性 |

#### 8.2 分段详细结论 *(★ v1.2: 在对比功能中展示)*

**按场景分段陈述事实性结论:**

**训练场景:**
> (示例)被测芯片 [S5000] 在 7B 模型训练下达到基准的 **135%**,表现突出。
> 70B 模型标记为 N/A(显存不足,单卡 80GB < 140GB 最低需求)。

**推理场景:**
> (示例)C1 (128/1024) 达到基准的 **112%**,C5 (8192/1024) 下降至 **67%**。
> Decode 整体 **85%**,Prefill **72%**,访存密集场景更弱。

**能效:**
> (示例)训练 Tokens/Watt 为基准的 **115%**(TDP 低 50W,性能接近)。
> TCO 比基准低 **12%**,有成本优势。

#### 8.3 适用场景评估 *(★ v1.2: 在对比功能中展示)*

| 场景 | vs 基准 | 状态 | 结论 |
|------|:---:|:---:|------|
| 7B 模型训练 | 135% | ✅ tested | 超越基准 |
| 70B 模型训练 | - | ⚠️ N/A | 显存不足,无法单卡测试 |
| 7B 模型推理 | 112% | ✅ tested | 超越基准 |
| 70B 模型推理 | 67% | ✅ tested | 低于基准,需多卡 |
| 多模态推理 | - | ⚠️ N/A | 未适配 vLLM |
| 分布式训练 | 95% | ✅ tested | 接近基准 |

#### 8.4 瓶颈分析与优化建议

**自动瓶颈诊断逻辑:**

```
IF 训练大模型性能 << 训练小模型性能:
  → 瓶颈: 显存容量或显存带宽
  → 建议: 优化模型并行策略,考虑下一代 HBM 版本

IF Decode TGS 比值 < Prefill TGS 比值:
  → 瓶颈: 显存带宽(Decode 是访存密集型)
  → 建议: 优化 KV Cache 管理,使用更激进的量化

IF 多卡扩展效率 < 70%:
  → 瓶颈: 互联带宽或通信算子
  → 建议: 优化通信拓扑,检查 AllReduce 实现

IF Tokens/Watt 超过基准但绝对性能低:
  → 亮点: TCO 优势,适合成本敏感场景
  → 建议: 重点推荐小模型推理/训练场景
```

---

### 9. 历史趋势对比(同芯片多次评测) ★ 新增

> 同一芯片在不同时间的多次评测结果对比,用于跟踪芯片厂商软件栈/固件迭代的性能变化。

#### 9.1 趋势摘要

| 指标 | 上次评测 | 本次评测 | **变化** | 说明 |
|------|---------|---------|:---:|------|
| 训练 vs 基准 | 120% | 135% | **+15%↑** | 软件栈优化 |
| 推理 vs 基准 | 95% | 112% | **+17%↑** | 新增 vLLM 支持 |
| NCCL busbw | 380 GB/s | 490 GB/s | **+29%↑** | 通信库升级 |
| 算子通过率 | 85% | 92% | **+7%↑** | 新增算子适配 |

#### 9.2 历史评测记录

| 评测日期 | 软件栈版本 | 固件版本 | 基准芯片 | 关键变化 |
|---------|-----------|---------|---------|----------|
| 2026-01-15 | SDK 1.0 | FW 2.1 | L40S | 初始评测 |
| 2026-03-10 | SDK 1.2 | FW 2.3 | L40S | 训练吞吐 +15%,新增 FP8 |
| 2026-04-14 | SDK 1.5 | FW 2.5 | L40S | 推理 +17%,vLLM 适配 |

#### 9.3 趋势图

**可视化:**折线图,X 轴=评测日期,Y 轴=vs 基准百分比,多指标叠加(训练/推理/通信/算子)

**数据模型:**

```json
// ChipReport.evaluation_history
{
  "chip_id": "chip_xxx",
  "evaluations": [
    {
      "report_id": "report_001",
      "date": "2026-01-15",
      "software_version": "SDK 1.0",
      "firmware_version": "FW 2.1",
      "baseline_chip": "NVIDIA_L40S",
      "key_metrics": {
        "training_vs_baseline": 1.20,
        "inference_vs_baseline": 0.95,
        "nccl_peak_busbw_gbps": 380,
        "operator_pass_rate": 0.85,
        "training_tokens_per_watt": 22.5
      }
    }
  ]
}
```

---

## 五、评测报告数据模型扩展

### 5.1 ChipReport 表扩展

```sql
ALTER TABLE chip_reports ADD COLUMN training_summary JSONB;
ALTER TABLE chip_reports ADD COLUMN inference_summary JSONB;
ALTER TABLE chip_reports ADD COLUMN energy_efficiency JSONB;
ALTER TABLE chip_reports ADD COLUMN baseline_config JSONB;           -- 可配置基准芯片
ALTER TABLE chip_reports ADD COLUMN evaluation_history JSONB;        -- 历史评测记录
ALTER TABLE chip_reports ADD COLUMN untestable_items JSONB;          -- 不可测项目及原因
ALTER TABLE chip_reports ADD COLUMN scenario_recommendations JSONB;
ALTER TABLE chip_reports ADD COLUMN display_config JSONB DEFAULT '{"default_expand": ["executive_summary"], "collapse_all_others": true}';  -- 展示配置
```

```json
// training_summary 结构
{
  "baseline_chip": "NVIDIA_L40S",
  "vs_baseline_avg_ratio": 1.35,
  "best_model": {"name": "Llama2-7B", "vs_baseline": 1.35},
  "worst_model": {"name": "Llama2-70B", "vs_baseline": 0.48},
  "model_results": [
    {
      "model_name": "Llama2-7B",
      "model_size": "7B",
      "throughput_tokens_per_sec_per_gpu": 10000,
      "vs_baseline": 1.35
    }
  ],
  "scaling_efficiency": {
    "2_gpu": 0.95,
    "4_gpu": 0.88,
    "8_gpu": 0.78
  }
}

// inference_summary 结构
{
  "baseline_chip": "NVIDIA_L40S",
  "vs_baseline_avg_ratio": 1.12,
  "model_results": [
    {
      "model_name": "Qwen3-8B",
      "model_size": "8B",
      "quantization": "FP16",
      "configs": [
        {
          "config_label": "C7",
          "input_tokens": "3.0~3.6k",
          "output_tokens": "0.3~0.5k",
          "decode_tgs": 1109.3,
          "prefill_tgs": 9657.3,
          "baseline_decode_tgs": 1320.5,
          "baseline_prefill_tgs": 11200.0,
          "decode_vs_baseline": 0.84,
          "prefill_vs_baseline": 0.86,
          "sla_pass": true
        }
      ]
    }
  ],
  "concurrency_results": [
    {"concurrency": 1, "qps": 100, "p99_ms": 50, "sla_pass_rate": 1.0},
    {"concurrency": 8, "qps": 600, "p99_ms": 120, "sla_pass_rate": 0.98}
  ]
}
```

### 4.2 评测模板扩展

在 `parameters.llm_evaluation` 中增加:

```json
{
  "llm_evaluation": {
    // ... 原有参数 ...
    "token_configs": [
      {"label": "C1", "input_tokens": 128, "output_tokens": 1024, "description": "短问题长回答"},
      {"label": "C2", "input_tokens": 1024, "output_tokens": 1024, "description": "中等等长"},
      {"label": "C3", "input_tokens": 1024, "output_tokens": 8192, "description": "中输入超长输出"},
      {"label": "C4", "input_tokens": 2048, "output_tokens": 2048, "description": "中等等长"},
      {"label": "C5", "input_tokens": 8192, "output_tokens": 1024, "description": "长文档短摘要"},
      {"label": "C6", "input_tokens": 16000, "output_tokens": 500, "description": "超长上下文短回答"},
      {"label": "C7", "input_tokens": 3600, "output_tokens": 500, "description": "中长输入短回答"}
    ],
    "sla_constraints": {
      "max_prefill_latency_ms": 3000,
      "max_decode_latency_ms": 50,
      "ttft_sla_ms": 2000,
      "tpot_sla_ms": 200
    },
    "measure_prefill_decode_separately": true,
    "training_models": [
      {"name": "Llama2-7B", "size": "7B"},
      {"name": "Llama2-70B", "size": "70B"},
      {"name": "Qwen3-8B", "size": "8B"}
    ],
    "inference_models": [
      {"name": "DeepSeek-R1-671B", "size": "671B", "quantization": "INT8"},
      {"name": "Qwen3-235B", "size": "235B", "quantization": "INT8"},
      {"name": "DeepSeek-V3-70B", "size": "70B", "quantization": "FP16"},
      {"name": "Qwen3-vl-235B", "size": "235B", "quantization": "INT8", "multimodal": true}
    ],
    "nccl_test": {
      "enabled": true,
      "scope": "intra_node",
      "operation": "allreduce_sum",
      "datatype": "float",
      "min_bytes": "8",
      "max_bytes": "8G",
      "step_factor": 2,
      "num_gpus": 8,
      "iterations": 20,
      "warmup_iterations": 5,
      "report_key_sizes": ["8B", "1KB", "1MB", "32MB", "256MB", "1GB", "8GB"]
    }
  }
}
```

---

## 六、可视化组件清单

| 组件 | 用途 | 库建议 |
|------|------|--------|
| **分组柱状图** | 多芯片训练/推理吞吐对比 | ECharts / Chart.js |
| **堆叠柱状图** | Decode + Prefill 分解 | ECharts |
| **雷达图(八维)** | 芯片综合能力画像 *(★ v1.2: 仅在对比功能中使用)* | ECharts |
| **热力图** | 模型 × 配置的性能比值矩阵 | ECharts |
| **折线图** | 多卡扩展性、Loss 收敛曲线 | ECharts |
| **散点图** | Prefill vs Decode 性能分布 | ECharts |
| **表格(可排序)** | 详细数据展示 | Ant Design Table |
| **卡片** | 芯片规格、总览指标 | 自定义组件 |
| **带宽-消息大小曲线** | NCCL AllReduce busbw 随消息大小变化 | ECharts(对数X轴) |
| **基准比值徽章** | vs L40S 百分比标记(绿/黄/红) | 自定义组件 |

---

## 七、与现有 v2 设计的整合建议

1. **报告页面（5.4 节）** → 替换为本文档的完整结构，采用渐进式展示（默认折叠）
2. **数据模型** → ChipReport 表增加 baseline_config / energy_efficiency / evaluation_history / untestable_items 等字段
3. **评测模板 JSON Schema** → llm_evaluation 参数扩展 token_configs、sla_constraints、nccl_test、model_memory_requirements
4. **模板预置** → 新增“大模型训练性能评测”和“大模型推理性能评测”两个预置模板
5. **基准体系** → 可配置基准芯片（默认 L40S），支持多基准对比，不做主观评分
6. **能效维度** → Tokens/Watt 独立成章，含 TCO 参考估算
7. **历史趋势** → 支持同芯片多次评测结果对比，跟踪迭代进展
8. **不可测处理** → 明确标注状态和原因，不计入平均值
9. **模型-芯片联动** → 根据显存容量自动过滤不可测模型

---

*文档结束。v1.1 新增基准可配置、能效分析、历史趋势、渐进式展示、模型-芯片联动、「测不了」处理机制。*
