# AHVP 评测报告模板增强设计

> **文档版本:** v1.0
> **创建日期:** 2026-04-13
> **基于:** evaluation-module-redesign-v2.md 第五部分 + 行业对标研究
> **目标:** 完善训练和推理评测报告的数据展示、对比维度和可视化方案

---

## 一、当前问题

v2 设计文档中报告页面（5.4 节）仅做了模块级大纲：
- 只有"模型评测结果"一个笼统的表，未区分**训练**和**推理**
- 缺少**多模型横评**视角（如同时对比 DeepSeek-R1-671B / Qwen3-235B / DeepSeek-70B）
- 缺少**多输入输出配置**维度（如 128/1024、1024/8192、2048/2048 等 token 组合）
- 缺少**Decode / Prefill 分离展示**（推理场景的关键指标）
- 缺少**芯片间横向对比**和**梯队划分**
- 缺少**产品路线图**和**纸面规格 vs 实测性能**的关联分析

以下设计参考行业实际评测报告（含产品硬件规格对比、训练吞吐对比、推理多模型横评、单芯片详细 Benchmark 等），充分补齐这些缺失。

---

## 二、报告整体结构（增强版）

```
评测报告
├── 0. 报告封面与元数据
├── 1. 执行摘要（Executive Summary）
├── 2. 芯片硬件规格概览
│   ├── 2.1 目标芯片规格卡片
│   ├── 2.2 竞品规格对比表
│   └── 2.3 下一代产品路线图（可选）
├── 3. 芯片基础性能（Layer 1）
│   ├── 3.1 实测算力 vs 标称算力
│   ├── 3.2 内存带宽
│   ├── 3.3 互联带宽
│   ├── 3.4 功耗与能效
│   └── 3.5 NCCL 通信性能测试（机内 AllReduce）  ★ 新增
├── 4. 算子评测结果（Layer 2）
│   ├── 4.1 精度测试概览
│   └── 4.2 性能测试排行
├── 5. 训练性能评测（Layer 5 - Training）     ★ 新增
│   ├── 5.1 训练性能总览
│   ├── 5.2 分模型训练吞吐对比
│   ├── 5.3 多卡扩展性分析
│   └── 5.4 训练稳定性与收敛性
├── 6. 推理性能评测（Layer 5 - Inference）     ★ 新增
│   ├── 6.1 推理性能总览
│   ├── 6.2 多模型横评
│   ├── 6.3 输入输出配置矩阵
│   ├── 6.4 Decode / Prefill 详细分析
│   ├── 6.5 并发性能与 SLA 达标率
│   └── 6.6 多模态推理（可选）
├── 7. 综合评价
│   ├── 7.1 综合能力概览（基于 L40S 基准）
│   ├── 7.2 分段详细结论
│   ├── 7.3 适用场景评估
│   └── 7.4 瓶颈分析与优化建议
├── 8. 评测环境与方法论
└── 附录
```

---

## 三、各模块详细设计

### 2. 芯片硬件规格概览

#### 2.1 目标芯片规格卡片

以卡片形式展示被测芯片的核心参数：

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
| INT8 TOPS | — | 芯片档案 specs |
| 显存容量 | 80 GB | 芯片档案 specs |
| 显存类型 | GDDR6 | 芯片档案 specs |
| 显存带宽 | 1.6 TB/s | 芯片档案 specs |
| 互联带宽 | 800 GB/s | 芯片档案 specs |
| TDP | 450 W | 芯片档案 specs |

#### 2.2 竞品规格对比表

横向对比被测芯片与基准芯片、其他国产芯片：

| 字段 | 被测芯片 | NVIDIA A100 | NVIDIA H200 | 华为 910C | ... |
|------|---------|-------------|-------------|-----------|-----|
| FP16 TFLOPS | — | 312 | 989.5 | 780 | ... |
| 显存 (GB) | — | 80 | 141 | 128 | ... |
| 显存带宽 (TB/s) | — | 2.0 | 4.8 | 3.2 | ... |
| 互联带宽 (GB/s) | — | 600 | 900 | 700 | ... |

**可视化方案:**
- 分组柱状图：多芯片多指标对比
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

### 3.5 NCCL 通信性能测试（机内 AllReduce） ★ 新增

> 基于 [NVIDIA nccl-tests](https://github.com/NVIDIA/nccl-tests)，评测机内多卡集合通信性能。
> 对于非 NVIDIA 芯片，使用对应的通信库测试工具（如 MCCL-tests、HCCL-tests），指标定义保持一致。

#### 测试方法

**测试工具映射：**

| 芯片厂商 | 通信库 | 测试工具 | 测试命令 |
|---------|--------|---------|----------|
| NVIDIA | NCCL | nccl-tests | `all_reduce_perf` / `all_reduce_perf_mpi` |
| 华为昇腾 | HCCL | hccl-tests | `all_reduce_test` |
| 摩尔线程 | MCCL | mccl-tests | `all_reduce_perf` |
| 其他国产 | 各只实现 | 对应测试工具 | 参数保持一致 |

**标准测试命令：**

```bash
# === NVIDIA GPU 机内 8 卡 AllReduce ===
# 全范围扫描（8B~8GB）
./build/all_reduce_perf -b 8 -e 8G -f 2 -g 8 -n 20 -w 5

# MPI 模式（单机 8 卡）
mpirun --allow-run-as-root -bind-to none -map-by slot \
  all_reduce_perf_mpi -b 2048M -e 8192M -f 2 -g 1

# === 华为昇腾 910C 机内 16 NPU AllReduce ===
mpirun -np 16 all_reduce_test -p 16 -b 1G -e 16G -f 2 -w 5 -n 20 -c 1
```

> 参考：[SenseCore ACP nccl-test 最佳实践](https://www.sensecore.cn/help/docs/cloud-foundation/compute/acp/acpBestPractices/Job-nccl_test)；910C D设施项目 HCCL 测试报告

**网络环境变量（RoCE v2 400G 场景）：**

```bash
# NCCL 环境变量（根据实际网络方案调整）
export NCCL_IB_GID_INDEX=5
export NCCL_IB_TC=138
export NCCL_IB_QPS_PER_CONNECTION=8
# 基线测试可设置更高并发度（实际训练中需根据计算/通信资源平衡调整）
export NCCL_MIN_NCHANNELS=32
```

**测试参数说明：**

| 参数 | 值 | 说明 |
|------|------|------|
| 消息大小范围 | 8B ~ 8GB | 覆盖小消息延迟和大消息带宽场景 |
| 步进方式 | ×2 (factor=2) | 对数均匀扫描 |
| GPU/NPU 数量 | 8 或 16 (机内全卡) | 测试机内全卡互联带宽 |
| 迭代次数 | 20 | 确保结果稳定 |
| 预热迭代 | 5 | 排除冷启动影响 |
| 数据类型 | float (FP32) | 默认，可额外测试 fp16/bf16 |
| 操作 | AllReduce (Sum) | 训练场景最关键的集合通信 |

#### 慢节点检测标准

> 参考 SenseCore Network Diagnostic Toolkit 慢节点判定标准：

- **基线值**：实测 `max_algbw` 的 **80%** 为最低基线
- **慢节点判定**：单节点 busbw 低于基线值，则标记为疑似慢节点
- **检测命令**：`bash everun_base.sh`（单机）/ `bash everun_dect.sh`（并行模式）

#### 核心指标

| 指标 | 定义 | 说明 |
|------|------|------|
| **Bus Bandwidth (busbw)** | `algbw × 2×(n-1)/n` | ⭐ **核心指标**，反映硬件互联带宽的实际利用率，可直接与硬件峰值带宽对比 |
| Algorithm Bandwidth (algbw) | `S / t` | 算法带宽，会随 GPU 数量变化，不宜直接对比 |
| Latency | 操作时间 (ms) | 小消息场景的延迟，反映通信库启动开销 |
| 带宽利用率 | busbw / 硬件峰值带宽 | 衡量通信库优化程度 |

> ℹ️ **为什么用 Bus Bandwidth**：AllReduce 的算法带宽会随卡数增加而下降，而 Bus Bandwidth 经过校正后可以直接与硬件峰值对比，独立于 GPU 数量。参考 [NCCL Tests PERFORMANCE.md](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md)。

#### 测试项目

| 测试项 | 优先级 | 场景 | 命令 |
|---------|:---:|------|------|
| **AllReduce** | 必测 | 训练梯度同步，最关键的集合通信 | `all_reduce_perf` |
| **AlltoAll** | 建议 | MoE 模型的 Expert Parallel | `alltoall_perf` |
| **AllGather** | 可选 | 模型并行参数收集 | `all_gather_perf` |
| **ReduceScatter** | 可选 | ZeRO 优化器状态分割 | `reduce_scatter_perf` |

#### 结果展示

**摘要卡片（AllReduce 为主）：**

| 指标 | 被测芯片 | L40S (基准) | **vs L40S** |
|------|---------|-----------|:---:|
| 峰值 Bus Bandwidth (GB/s) | — | — | —% |
| 小消息延迟 (8B~1KB, µs) | — | — | —% |
| 带宽利用率 (busbw / 硬件峰值) | —% | —% | — |
| AlltoAll 峰值 busbw (GB/s) | — | — | —% |

**详细结果表（关键消息大小点）：**

| 消息大小 | 被测芯片 busbw (GB/s) | L40S busbw (GB/s) | **vs L40S** | 延迟 (ms) | 备注 |
|---------|:---:|:---:|:---:|:---:|------|
| 8 B | — | — | —% | — | 小消息延迟 |
| 1 KB | — | — | —% | — | |
| 1 MB | — | — | —% | — | |
| 32 MB | — | — | —% | — | |
| 256 MB | — | — | —% | — | |
| 1 GB | — | — | —% | — | 大消息峰值带宽 |
| 8 GB | — | — | —% | — | |

**可视化方案：**
1. **带宽-消息大小曲线图**：X 轴=消息大小（对数坐标），Y 轴=Bus Bandwidth (GB/s)，多芯片叠加对比
2. **带宽利用率柱状图**：峰值 busbw 占硬件理论峰值的比例

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
    "vs_baseline_latency": 1.145         // 25.3 / 22.1 (越小越好，>1 表示更慢)
  }
}
```

---

### 5. 训练性能评测（★ 新增模块）

#### 5.1 训练性能摘要

> **基准芯片: NVIDIA L40S = 100%**，所有性能值均以 L40S 实测值为基准换算百分比。

以摘要卡片形式展示核心指标，不做主观打分：

| 指标 | 说明 | 呈现方式 |
|------|------|----------|
| vs L40S 平均训练性能 | 所有模型训练吞吐的几何平均比值 | **百分比**（如 135% = 比 L40S 快 35%） |
| 最优模型 | 相对 L40S 性能比最高的模型 | 模型名 + 百分比 |
| 最弱模型 | 相对 L40S 性能比最低的模型 | 模型名 + 百分比 |
| 关键瓶颈 | 自动诊断的主要性能瓶颈 | 文字描述 |

**颜色规则：** ≥100% 绿色（持平或超越基准），80%-99% 黄色（接近基准），<80% 红色（显著落后）

#### 5.2 分模型训练吞吐对比

**关键指标:** Tokens/s/GPU（大模型）或 Samples/s/GPU（传统模型）

**参考行业对标维度:**

| 模型 | 模型规模 | 被测芯片 Tokens/s/GPU | L40S (基准) | **vs L40S** | 备注 |
|------|---------|:---:|:---:|:---:|------|
| Llama2-7B | 7B | — | — | —% | |
| Llama2-70B | 70B | — | — | —% | |
| Qwen3-8B | 8B | — | — | —% | |
| Qwen3-72B | 72B | — | — | —% | |
| DeepSeek-R1-7B | 7B | — | — | —% | |
| GPT-J-6B | 6B | — | — | —% | |

> 如有其他对标芯片（A100、H200 等），在备注列注明或以附加列展示。

**可视化方案:**
1. **分组柱状图**（参考图3样式）：X 轴=模型，Y 轴=Tokens/s/GPU，不同芯片用不同颜色
2. **性能比值热力图**：每个模型 × 每个芯片的 vs 基准比值，颜色深浅表示性能

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
| 1 | — | — | 100% | 100% |
| 2 | — | — | —% | —% |
| 4 | — | — | —% | —% |
| 8 | — | — | —% | —% |

**可视化:** 折线图，X=卡数，Y=吞吐，虚线=理想线性，实线=实际

#### 5.4 训练稳定性与收敛性

| 指标 | 说明 |
|------|------|
| Loss 收敛曲线 | 与基准芯片的 loss 曲线对比，验证训练等价性 |
| Loss Cosine Similarity | 与基准芯片的 loss 序列余弦相似度（>0.99 为 PASS） |
| 梯度一致性 | 前 N 步梯度与基准的余弦相似度 |
| 长时间训练稳定性 | 无 NaN/Inf、无性能退化 |

---

### 6. 推理性能评测（★ 新增模块）

#### 6.1 推理性能摘要

> **基准芯片: NVIDIA L40S = 100%**

| 指标 | 说明 | 呈现方式 |
|------|------|----------|
| vs L40S 平均推理性能 | 所有模型/配置的 Output TGS 几何平均比值 | **百分比** |
| 最优场景 | 相对 L40S 性能比最高的模型+配置 | 模型名 + 配置 + 百分比 |
| 最弱场景 | 相对 L40S 性能比最低的模型+配置 | 模型名 + 配置 + 百分比 |
| Decode vs Prefill 倾向 | Decode 和 Prefill 哪个相对更强/更弱 | 文字描述 |
| SLA 达标率 | 满足延迟约束的配置占比 | 百分比 |

**颜色规则同训练模块。**

#### 6.2 多模型横评

**参考行业对标（图4 样式），多模型并排对比:**

**模型列表（推荐）：**

| 模型 | 规模 | 场景 | 量化 | 说明 |
|------|------|------|------|------|
| DeepSeek-R1-671B | 671B | 推理 | INT8 | 超大模型，考验显存和带宽 |
| DeepSeek-V3-70B | 70B | 推理 | FP16/INT8 | 中等规模主流模型 |
| Qwen3-235B | 235B | 推理 | INT8 | 国产大模型代表 |
| Qwen3-vl-235B | 235B | 多模态推理 | INT8 | 图文理解场景 |
| Llama3-8B | 8B | 推理 | FP16 | 小模型基准 |
| Llama3-70B | 70B | 推理 | FP16/INT8 | 通用大模型基准 |

**每个模型的标准输入输出配置矩阵（参考图4/图5 样式）：**

| 配置编号 | 输入 Tokens | 输出 Tokens | 场景描述 |
|---------|:---:|:---:|------|
| C1 | 128 | 1024 | 短问题长回答（日常对话） |
| C2 | 1024 | 1024 | 中等输入等长回答 |
| C3 | 1024 | 8192 | 中等输入超长回答（文章生成） |
| C4 | 2048 | 2048 | 等长中等序列 |
| C5 | 8192 | 1024 | 长文档短摘要 |
| C6 | 16000~20000 | 300~500 | 超长上下文短回答 |
| C7 | 3000~3600 | 300~500 | 中长输入短回答 |

#### 6.3 输入输出配置矩阵

每个模型 × 每个配置的综合结果表：

| 模型 | 配置 | 被测芯片 Output TGS | L40S (基准) | **vs L40S** | 备注 |
|------|------|:---:|:---:|:---:|------|
| DeepSeek-R1-671B-int8 | C1 (128/1024) | — | — | —% | |
| DeepSeek-R1-671B-int8 | C5 (8192/1024) | — | — | —% | |
| Qwen3-235B | C1 (128/1024) | — | — | —% | |
| ... | ... | ... | ... | ... | ... |

**可视化方案:**
1. **分组柱状图**（每个模型一张子图）：X=配置，Y=TGS，不同芯片不同颜色
2. **热力图**：模型 × 配置的性能比值矩阵
3. **雷达图**：每个芯片在不同模型上的相对表现

#### 6.4 Decode / Prefill 详细分析

**参考图5（S5000 vs H200 Qwen3-8B 数据）**，推理性能需要拆分为两个阶段：

| 阶段 | 含义 | 关键指标 |
|------|------|---------|
| **Prefill** | 处理输入 tokens（计算密集） | Prefill TGS (tokens/s)、Prefill 延迟 (ms) |
| **Decode** | 逐 token 生成输出（访存密集） | Decode TGS (tokens/s)、TPOT (ms/token) |

**详细结果表（每个模型一张）：**

| 输入/输出 | 约束条件 | 被测芯片 Decode TGS | L40S Decode TGS | **vs L40S** | 被测芯片 Prefill TGS | L40S Prefill TGS | **vs L40S** |
|-----------|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| 3.0~3.6k / 0.3~0.5k | prefill<3000ms, decode<50ms | — | — | —% | — | — | —% |
| 16~20k / 0.3~0.5k | decode<50ms | — | — | —% | — | — | —% |
| 0.8~1k / 1.6~2k | prefill<3000ms, decode<50ms | — | — | —% | — | — | —% |
| 3.6~4k / 1.6~2k | prefill<3000ms, decode<50ms | — | — | —% | — | — | —% |
| 11~15k / 2.5~2.9k | prefill<3000ms, decode<50ms | — | — | —% | — | — | —% |

**约束条件说明：**
- `prefill < 3000ms`：首 token 延迟不超过 3 秒
- `decode < 50ms`：单 token 生成延迟不超过 50ms
- 不满足约束的数据点标记为 "SLA Fail"

**可视化方案:**
1. **双 Y 轴柱状图**：左 Y=Decode TGS，右 Y=Prefill TGS
2. **散点图**：X=Prefill TGS，Y=Decode TGS，每个点代表一个配置，气泡大小=输入长度

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
  "baseline_comparison": {
    "baseline_chip": "NVIDIA_L40S",
    "baseline_decode_tgs": 1320.5,
    "baseline_prefill_tgs": 11200.0,
    "decode_vs_baseline": 0.84,
    "prefill_vs_baseline": 0.86
  }
}
```

#### 6.5 并发性能与 SLA 达标率

| 并发数 | 被测芯片 QPS | L40S QPS | **vs L40S** | P99 延迟 (ms) | SLA 达标率 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | — | — | —% | — | —% |
| 4 | — | — | —% | — | —% |
| 8 | — | — | —% | — | —% |
| 16 | — | — | —% | — | —% |
| 32 | — | — | —% | — | —% |

**SLA 标准（对齐 MLPerf）：**
- TTFT ≤ 2000ms
- TPOT ≤ 200ms
- 错误率 < 1%

#### 6.6 多模态推理（可选）

针对 Vision-Language 模型（如 Qwen3-vl-235B）：

| 输入 | 被测芯片 TGS | 基准 TGS | 比值 |
|------|:---:|:---:|:---:|
| 1920×1080 图片 + 1024 tokens | — | — | —% |
| 1280×720 图片 + 2048 tokens | — | — | —% |
| 4K 图片 + 512 tokens | — | — | —% |

---

### 7. 综合评价

#### 7.1 综合能力概览（基于 L40S 基准）

> **不做主观打分**，所有维度均以 vs L40S 百分比呈现，读者自行判断。

以八维度百分比表格呈现（可选配雷达图辅助可视化）：

| 维度 | 计算方式 | 被测芯片 vs L40S | 说明 |
|------|---------|:---:|------|
| 算力 | 实测 TFLOPS / L40S 实测 TFLOPS | —% | |
| 访存 | 实测带宽 / L40S 实测带宽 | —% | |
| 通信 | 实测互联 / L40S 实测互联 | —% | |
| 算子 | 精度通过率 × 性能均值 / L40S | —% | |
| 训练 | 训练吞吐几何平均 / L40S | —% | |
| 推理 | 推理 TGS 几何平均 / L40S | —% | |
| 扩展性 | 8卡扩展效率 / L40S 8卡扩展效率 | —% | |
| 生态 | 框架兼容性 + 量化支持覆盖率 | —% | 定性评估 |

#### 7.2 分段详细结论

不做梯队划分，改为**按场景分段陈述事实性结论**：

**训练场景结论：**
> （示例）被测芯片 [S5000] 在 7B 模型训练场景下达到 L40S 的 **135%**，表现突出。
> 但 70B 模型训练仅达到 L40S 的 **48%**，主要瓶颈在 GDDR6 显存带宽。

**推理场景结论：**
> （示例）短输入短输出场景（C1: 128/1024）达到 L40S 的 **112%**。
> 长输入场景（C5: 8192/1024）下降至 L40S 的 **67%**，Prefill 阶段成为瓶颈。
> Decode 性能整体为 L40S 的 **85%**，Prefill 为 **72%**。

**扩展性结论：**
> （示例）8 卡扩展效率 **78%**（L40S 为 82%），互联带宽尚可但存在优化空间。

#### 7.3 适用场景评估

> 不做星级推荐，直接用 vs L40S 百分比说话：

| 场景 | vs L40S | 结论 |
|------|:---:|------|
| 7B 模型训练 | 135% | 超越基准，可满足生产需求 |
| 7B 模型推理 | 112% | 超越基准，满足大部分 SLA |
| 70B 模型训练 | 48% | 显著低于基准，显存容量为主要制约 |
| 70B 模型推理 | 67% | 低于基准，需多卡部署 |
| 多模态推理 | 89% | 接近基准 |
| 分布式训练（8卡+） | 95%（效率比） | 接近基准，互联带宽尚可 |

#### 7.4 瓶颈分析与优化建议（增强版）

**自动瓶颈诊断逻辑:**

```
IF 训练大模型性能 << 训练小模型性能:
  → 瓶颈: 显存容量或显存带宽
  → 建议: 优化模型并行策略，考虑下一代 HBM 版本

IF Decode TGS 比值 < Prefill TGS 比值:
  → 瓶颈: 显存带宽（Decode 是访存密集型）
  → 建议: 优化 KV Cache 管理，使用更激进的量化

IF 多卡扩展效率 < 70%:
  → 瓶颈: 互联带宽或通信算子
  → 建议: 优化通信拓扑，检查 AllReduce 实现

IF 特定模型性能异常突出/低下:
  → 可能: 针对特定模型有/无软件栈优化
  → 建议: 检查算子覆盖率，关注 Attention 实现
```

---


---

## 四、评测报告数据模型扩展

### 4.1 ChipReport 表扩展

```sql
ALTER TABLE chip_reports ADD COLUMN training_summary JSONB;
ALTER TABLE chip_reports ADD COLUMN inference_summary JSONB;
ALTER TABLE chip_reports ADD COLUMN baseline_chip VARCHAR(50) DEFAULT 'NVIDIA_L40S';  -- 基准芯片
ALTER TABLE chip_reports ADD COLUMN scenario_recommendations JSONB;
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

在 `parameters.llm_evaluation` 中增加：

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

## 五、可视化组件清单

| 组件 | 用途 | 库建议 |
|------|------|--------|
| **分组柱状图** | 多芯片训练/推理吞吐对比 | ECharts / Chart.js |
| **堆叠柱状图** | Decode + Prefill 分解 | ECharts |
| **雷达图（八维）** | 芯片综合能力画像 | ECharts |
| **热力图** | 模型 × 配置的性能比值矩阵 | ECharts |
| **折线图** | 多卡扩展性、Loss 收敛曲线 | ECharts |
| **散点图** | Prefill vs Decode 性能分布 | ECharts |
| **表格（可排序）** | 详细数据展示 | Ant Design Table |
| **卡片** | 芯片规格、总览指标 | 自定义组件 |
| **带宽-消息大小曲线** | NCCL AllReduce busbw 随消息大小变化 | ECharts（对数X轴） |
| **基准比值徽章** | vs L40S 百分比标记（绿/黄/红） | 自定义组件 |

---

## 六、与现有 v2 设计的整合建议

1. **报告页面（5.4 节）** → 替换为本文档的完整结构
2. **数据模型（第六部分）** → ChipReport 表增加 training_summary / inference_summary / tier_classification 字段
3. **评测模板 JSON Schema（3.2 节）** → llm_evaluation 参数扩展 token_configs 和 sla_constraints
4. **模板预置（3.3 节）** → 新增"大模型训练性能评测"和"大模型推理性能评测"两个预置模板
5. **基准体系** → 以 L40S 为统一基准，所有维度按百分比呈现，不做主观评分

---

*文档结束。本设计充分参考了行业实际评测报告（含产品硬件规格横评、LLM 训练吞吐对比、LLM 推理多模型/多配置矩阵、Decode/Prefill 分离分析等），可直接指导 AHVP 评测报告模块的产品设计和开发实现。*
