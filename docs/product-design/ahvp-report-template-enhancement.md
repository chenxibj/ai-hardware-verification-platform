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
│   └── 3.4 功耗与能效
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
│   ├── 7.1 能力雷达图
│   ├── 7.2 梯队划分与竞品定位
│   ├── 7.3 适用场景推荐
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

### 5. 训练性能评测（★ 新增模块）

#### 5.1 训练性能总览

展示被测芯片在所有训练任务中的综合表现：

| 指标 | 说明 | 可视化 |
|------|------|--------|
| 训练综合评分 | 加权平均（vs 基准芯片） | 数字 + 评级（S/A/B/C/D） |
| vs A100 平均比值 | 所有训练任务的平均性能比 | 百分比 + 颜色标记 |
| vs H200 平均比值 | 同上 | 百分比 + 颜色标记 |
| 最优模型 | 表现最接近基准的模型 | 文字 |
| 最弱模型 | 差距最大的模型 | 文字 + 红色高亮 |

#### 5.2 分模型训练吞吐对比

**关键指标:** Tokens/s/GPU（大模型）或 Samples/s/GPU（传统模型）

**参考行业对标维度:**

| 模型 | 模型规模 | 被测芯片 Tokens/s/GPU | A100 | H200 | vs A100 | vs H200 |
|------|---------|:---:|:---:|:---:|:---:|:---:|
| Llama2-7B | 7B | — | — | — | —% | —% |
| Llama2-70B | 70B | — | — | — | —% | —% |
| Qwen3-8B | 8B | — | — | — | —% | —% |
| Qwen3-72B | 72B | — | — | — | —% | —% |
| DeepSeek-R1-7B | 7B | — | — | — | —% | —% |
| GPT-J-6B | 6B | — | — | — | —% | —% |

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
    "baseline_chip": "NVIDIA_A100",
    "baseline_throughput": 5000,
    "performance_ratio": 2.0,
    "h200_throughput": 17500,
    "vs_h200_ratio": 0.57
  }
}
```

#### 5.3 多卡扩展性分析

| 卡数 | 被测芯片 Tokens/s | 理想线性扩展 | 实际扩展效率 | A100 扩展效率 |
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

#### 6.1 推理性能总览

| 指标 | 说明 |
|------|------|
| 推理综合评分 | 加权平均 |
| 最优场景 | 哪个模型/配置表现最好 |
| 最弱场景 | 哪个模型/配置差距最大 |
| vs A100/H200/H20 平均比值 | — |

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

| 模型 | 配置 | 被测芯片 Output TGS | A100 | H200/H20 | vs A100 | vs H200 |
|------|------|:---:|:---:|:---:|:---:|:---:|
| DeepSeek-R1-671B-int8 | C1 (128/1024) | — | — | — | —% | —% |
| DeepSeek-R1-671B-int8 | C5 (8192/1024) | — | — | — | —% | —% |
| Qwen3-235B | C1 (128/1024) | — | — | — | —% | —% |
| ... | ... | ... | ... | ... | ... | ... |

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

| 输入/输出 | 约束条件 | 被测芯片 Decode TGS | 基准 Decode TGS | **比值** | 被测芯片 Prefill TGS | 基准 Prefill TGS | **比值** |
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
    "baseline_chip": "NVIDIA_H200",
    "baseline_decode_tgs": 2713.1,
    "baseline_prefill_tgs": 22416.4,
    "decode_ratio": 0.408,
    "prefill_ratio": 0.430
  }
}
```

#### 6.5 并发性能与 SLA 达标率

| 并发数 | 被测芯片 QPS | 基准 QPS | P99 延迟 (ms) | SLA 达标率 |
|:---:|:---:|:---:|:---:|:---:|
| 1 | — | — | — | —% |
| 4 | — | — | — | —% |
| 8 | — | — | — | —% |
| 16 | — | — | — | —% |
| 32 | — | — | — | —% |

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

#### 7.1 能力雷达图（增强版）

在原有六维基础上，细化训练/推理子维度：

```
原六维: 算力 / 访存 / 通信 / 算子 / 模型 / 生态

增强为八维:
  算力 (实测 TFLOPS / 标称 TFLOPS)
  访存 (实测带宽 / 标称带宽)
  通信 (实测互联 / 标称互联)
  算子 (精度通过率 × 性能得分)
  训练 (加权训练吞吐 vs 基准)      ★ 新增
  推理 (加权推理 TGS vs 基准)      ★ 新增
  扩展性 (多卡效率)                 ★ 新增
  生态 (框架兼容性 + 量化支持)
```

#### 7.2 梯队划分与竞品定位

基于综合评分自动生成梯队（参考图4 的分析方式）：

| 梯队 | 综合评分 | 典型定位 |
|------|---------|---------|
| **T0 (领先)** | ≥ 90 | 全场景领先，可直接对标最新 NVIDIA 旗舰 |
| **T1 (主流)** | 70-89 | 部分场景超越 A100，综合能力均衡 |
| **T2 (可用)** | 50-69 | 特定场景可用，存在明显短板 |
| **T3 (受限)** | < 50 | 仅适合特定轻量场景 |

**结论模板示例:**
> 被测芯片 [S5000] 综合评分 72 分，归属 **T1 梯队**。
> - **训练场景:** 小模型（7B）训练性能突出（2x A100），但大模型（70B）训练急剧衰减（0.5x A100），瓶颈在于 GDDR6 显存带宽和 80GB 容量限制。
> - **推理场景:** 小模型推理达到 H200 的 35-50%，短输入长输出场景表现最差。
> - **适用场景:** 7B-13B 小模型训练与推理，不建议用于 70B+ 大模型。

#### 7.3 适用场景推荐

| 场景 | 推荐程度 | 说明 |
|------|---------|------|
| 7B 模型训练 | ⭐⭐⭐⭐⭐ | 性能突出 |
| 7B 模型推理 | ⭐⭐⭐⭐ | 满足大部分 SLA |
| 70B 模型训练 | ⭐ | 显存不足，性能急剧衰减 |
| 70B 模型推理 | ⭐⭐ | 需要多卡，效率低 |
| 多模态推理 | ⭐⭐⭐ | 中等水平 |
| 分布式训练（8卡+） | ⭐⭐⭐ | 互联带宽尚可 |

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

## 四、评测报告数据模型扩展

### 4.1 ChipReport 表扩展

```sql
ALTER TABLE chip_reports ADD COLUMN training_summary JSONB;
ALTER TABLE chip_reports ADD COLUMN inference_summary JSONB;
ALTER TABLE chip_reports ADD COLUMN tier_classification VARCHAR(10);  -- T0/T1/T2/T3
ALTER TABLE chip_reports ADD COLUMN scenario_recommendations JSONB;
```

```json
// training_summary 结构
{
  "overall_score": 72,
  "vs_a100_avg_ratio": 1.35,
  "vs_h200_avg_ratio": 0.42,
  "best_model": {"name": "Llama2-7B", "ratio_vs_a100": 2.0},
  "worst_model": {"name": "Llama2-70B", "ratio_vs_a100": 0.5},
  "model_results": [
    {
      "model_name": "Llama2-7B",
      "model_size": "7B",
      "throughput_tokens_per_sec_per_gpu": 10000,
      "vs_a100": 2.0,
      "vs_h200": 0.57
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
  "overall_score": 65,
  "vs_a100_avg_ratio": 1.1,
  "vs_h200_avg_ratio": 0.40,
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
          "baseline_decode_tgs": 2713.1,
          "baseline_prefill_tgs": 22416.4,
          "decode_ratio": 0.408,
          "prefill_ratio": 0.430,
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
    ]
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
| **评级徽章** | T0/T1/T2/T3 梯队标记 | 自定义组件 |

---

## 六、与现有 v2 设计的整合建议

1. **报告页面（5.4 节）** → 替换为本文档的完整结构
2. **数据模型（第六部分）** → ChipReport 表增加 training_summary / inference_summary / tier_classification 字段
3. **评测模板 JSON Schema（3.2 节）** → llm_evaluation 参数扩展 token_configs 和 sla_constraints
4. **模板预置（3.3 节）** → 新增"大模型训练性能评测"和"大模型推理性能评测"两个预置模板
5. **评分算法** → 增加训练/推理子维度权重，支持八维雷达图

---

*文档结束。本设计充分参考了行业实际评测报告（含产品硬件规格横评、LLM 训练吞吐对比、LLM 推理多模型/多配置矩阵、Decode/Prefill 分离分析等），可直接指导 AHVP 评测报告模块的产品设计和开发实现。*
