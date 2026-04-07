# 算子性能与精度评测产品设计文档

> **文档版本:** v1.1 (评审修订版)  
> **创建日期:** 2026-04-08  
> **修订日期:** 2026-04-08  
> **修订说明:** 基于评审反馈修订：标注算子实现状态、明确多精度分期约束、peak_gflops 动态获取、对比功能推 Phase 2、阈值标注初始推荐值  
> **作者:** AHVP 产品团队  
> **状态:** 评审修订版  
> **目标读者:** 产品负责人、后端开发、Agent 端开发、前端开发、测试团队  
> **依据:** 客户 PRD §1.7 算子性能评测 + §1.9 芯片精度评测 + DeepLink 评测方法论 + MLPerf Inference + ONNX Runtime conformance

---

## 目录

- [一、背景与目标](#一背景与目标)
- [二、现状分析与差距](#二现状分析与差距)
- [三、算子性能评测方法设计](#三算子性能评测方法设计)
  - [3.1 评测算子清单](#31-评测算子清单)
  - [3.2 性能指标体系](#32-性能指标体系)
  - [3.3 不同算子类型的关键指标差异](#33-不同算子类型的关键指标差异)
  - [3.4 测试配置矩阵](#34-测试配置矩阵)
  - [3.5 性能评测数据结构](#35-性能评测数据结构)
- [四、算子精度评测方法设计（核心新增）](#四算子精度评测方法设计核心新增)
  - [4.1 精度验证方法论](#41-精度验证方法论)
  - [4.2 精度指标体系](#42-精度指标体系)
  - [4.3 精度阈值标准](#43-精度阈值标准)
  - [4.4 各算子精度验证要点](#44-各算子精度验证要点)
  - [4.5 精度评测数据结构](#45-精度评测数据结构)
- [五、芯片/优化前后对比设计](#五芯片优化前后对比设计)
  - [5.1 对比维度](#51-对比维度)
  - [5.2 对比报告数据结构](#52-对比报告数据结构)
  - [5.3 对比 API 设计](#53-对比-api-设计)
  - [5.4 前端对比展示](#54-前端对比展示)
- [六、评测流程与模板设计](#六评测流程与模板设计)
  - [6.1 算子评测完整流程](#61-算子评测完整流程)
  - [6.2 评测模板预设](#62-评测模板预设)
  - [6.3 Agent 端执行协议](#63-agent-端执行协议)
- [七、数据模型设计](#七数据模型设计)
  - [7.1 算子评测结果表](#71-算子评测结果表)
  - [7.2 精度验证结果表](#72-精度验证结果表)
  - [7.3 对比报告表](#73-对比报告表)
- [八、API 设计](#八api-设计)
- [九、实施计划](#九实施计划)
- [附录 A：算子 FLOPs 计算公式](#附录-a算子-flops-计算公式)
- [附录 B：参考资料](#附录-b参考资料)

---

## 一、背景与目标

### 1.1 背景

AHVP（AI Hardware Verification Platform）致力于提供标准化的 AI 硬件全栈验证能力。在六层评测体系中，**算子评测（Layer 2）** 是承上启下的关键层——向下承接芯片裸机能力（Layer 1），向上支撑框架兼容性（Layer 4）和模型性能（Layer 5）。

客户 PRD 明确提出两大需求：

1. **§1.7 算子性能评测**：覆盖常用 AI 算子的延迟、吞吐、算力利用率、内存占用等维度，支持不同精度/硬件/输入尺寸的组合测试
2. **§1.9 芯片精度评测**：评估不同数据精度（FP32→FP16/INT8/BF16）下的精度损失，包括 MAE/MSE/Top-K 准确率等指标

同时，客户要求支持 **不同芯片之间** 和 **同芯片优化前后** 的评测数据对比展示，生成可量化的比较报告。

### 1.2 目标

| # | 目标 | 成功标准 |
|---|------|----------|
| G1 | 建立完整的算子性能评测体系 | 覆盖 16+ 基础算子 + 3 类复合算子 + 4 类通信算子，产出标准化性能指标 |
| G2 | **从零建立算子精度验证能力** | 支持 3 种精度验证方法、9 个精度指标、4 种数据类型阈值判定 |
| G3 | 支持多维度对比分析 | 跨芯片、跨精度、优化前后 3 种对比维度，前端可视化 4 种图表 |
| G4 | 与现有平台无缝集成 | 复用 Plan→Task→Agent→Result 架构，Agent 脚本平滑升级 |

### 1.3 非目标（Out of Scope）

- 本文档不涉及 Layer 1（芯片裸机评测）和 Layer 5+（模型/场景评测）的设计
- 不涉及分布式训练场景下的通信算子性能评测（Phase 3 再纳入）
- 不涉及自定义算子的自动发现和注册（后续迭代）

---

## 二、现状分析与差距

### 2.1 现有能力

| 脚本 | 能力 | 局限 |
|------|------|------|
| `cpu_operator_benchmark.py` | 14 种算子的性能测试（latency/throughput/cpu_util），支持 Attention 分步延迟 | ❌ 无精度验证 ❌ 无 GFLOPS/算力利用率 ❌ 无内存占用 ❌ 仅 FP32 |
| `cpu_model_inference.py` | MLP 模型推理基准（ONNX Runtime + NumPy 回退） | ❌ 无模型精度对比 ❌ 无多精度支持 |

### 2.2 差距矩阵

| 能力维度 | 客户需求 | 现状 | 差距 |
|----------|----------|------|------|
| 算子精度验证 | 参考对比 + 跨精度 + 数学性质 | 完全没有 | 🔴 从零建设 |
| 多精度性能测试 | FP32/FP16/BF16/INT8 | 仅 FP32 | 🔴 需扩展 |
| GFLOPS / 算力利用率 | 需要 | 无 | 🟡 需补充 |
| 内存/显存占用 | 需要 | 无 | 🟡 需补充 |
| 对比报告 | 跨芯片 + 跨精度 + 优化前后 | 无 | 🔴 从零建设 |
| 评测模板 | 快速/标准/全面 | 无算子专用模板 | 🟡 需新增 |
| 前端对比可视化 | 柱状图/雷达图/热力图/表格 | 无 | 🔴 从零建设 |

---

## 三、算子性能评测方法设计

### 3.1 评测算子清单

算子清单参考 DeepLink AIChipBenchmark、MLPerf Inference 预处理/后处理算子、ONNX Runtime operator coverage 以及主流 AI 框架（PyTorch / TensorFlow）的高频算子统计。

#### 3.1.1 基础算子（16 个）

| # | 算子名 | 分类 | 实现状态 | 目标阶段 | 典型应用 | 计算特征 |
|---|--------|------|----------|----------|----------|----------|
| 1 | MatMul | 计算密集 | ✅ 已实现 | Phase 1 | 全连接层、Attention | 计算密集型，FLOPs = 2*M*N*K |
| 2 | Conv2D | 计算密集 | ✅ 已实现 | Phase 1 | CNN 特征提取 | 计算密集型，FLOPs = 2*H*W*Cin*Cout*Kh*Kw |
| 3 | Conv3D | 计算密集 | ⬜ 待实现 | Phase 2 | 视频/医学影像 | 计算密集型 |
| 4 | DepthwiseConv | 计算密集 | ⬜ 待实现 | Phase 2 | MobileNet 轻量卷积 | 计算量比标准 Conv 小 Cout 倍 |
| 5 | BatchNorm | 归一化 | ✅ 已实现 | Phase 1 | CNN 各层之间 | 内存密集型 |
| 6 | LayerNorm | 归一化 | ✅ 已实现 | Phase 1 | Transformer | 内存密集型 |
| 7 | RMSNorm | 归一化 | ⬜ 待实现 | Phase 2 | LLaMA / Gemma | 内存密集型，无减均值 |
| 8 | ReLU | 激活函数 | ✅ 已实现 | Phase 1 | CNN / MLP | 元素级，极低计算量 |
| 9 | GELU | 激活函数 | ✅ 已实现 | Phase 1 | BERT / GPT | 元素级，含 tanh 近似 |
| 10 | SiLU (Swish) | 激活函数 | ✅ 已实现 | Phase 1 | EfficientNet / LLaMA | 元素级，含 sigmoid |
| 11 | Softmax | 激活函数 | ✅ 已实现 | Phase 1 | Attention / 分类头 | 涉及 reduce-max + exp + reduce-sum |
| 12 | Sigmoid | 激活函数 | ✅ 已实现 | Phase 1 | 门控机制 | 元素级 |
| 13 | MaxPool2D | 池化 | ⬜ 待实现 | Phase 1 | CNN 下采样 | 比较操作为主 |
| 14 | AvgPool2D | 池化 | ⬜ 待实现 | Phase 1 | CNN 下采样 | 累加 + 除法 |
| 15 | Dropout | 正则化 | ⬜ 待实现 | Phase 1 | 训练阶段 | 随机掩码，推理时 passthrough |
| 16 | Embedding | 查表 | ⬜ 待实现 | Phase 1 | NLP 词嵌入 | 内存随机访问 |

> **实现状态说明：** ✅ 已实现 = `cpu_operator_benchmark.py` 中已有可运行的性能测试代码；⬜ 待实现 = PRD 规划中，尚未编码。实际已实现 10 个算子（MatMul, Conv2D, BatchNorm, LayerNorm, ReLU, GELU, SiLU, Softmax, Sigmoid, Attention），其余 Phase 1 算子（MaxPool, AvgPool, Dropout, Embedding）需在本轮补充。

#### 3.1.2 复合算子（3 个）

| # | 算子名 | 组成 | 实现状态 | 目标阶段 | 典型应用 | 评测意义 |
|---|--------|------|----------|----------|----------|----------|
| 17 | Attention | QKV Linear → MatMul(QK^T) → Softmax → MatMul(AV) | ✅ 已实现 | Phase 1 | Transformer 核心 | 端到端延迟 + 分步延迟 |
| 18 | MLP | Linear → Activation → Linear | ⬜ 待实现 | Phase 2 | FFN 模块 | 融合优化效果 |
| 19 | FusedConvBNReLU | Conv2D → BatchNorm → ReLU | ⬜ 待实现 | Phase 2 | CNN 核心模式 | 算子融合增益验证 |

#### 3.1.3 通信算子（4 个，多卡场景）

| # | 算子名 | 通信模式 | 实现状态 | 目标阶段 | 典型应用 |
|---|--------|----------|----------|----------|----------|
| 20 | AllReduce | 全归约 | ⬜ 待实现 | Phase 3 | 数据并行梯度同步 |
| 21 | AllGather | 全收集 | ⬜ 待实现 | Phase 3 | 张量并行参数汇聚 |
| 22 | ReduceScatter | 归约散射 | ⬜ 待实现 | Phase 3 | ZeRO 优化器 |
| 23 | Broadcast | 广播 | ⬜ 待实现 | Phase 3 | 参数初始化分发 |

> **说明：** 通信算子仅在多卡/多节点环境下评测，Phase 3 实施。Phase 1/2 聚焦基础算子和复合算子。

### 3.2 性能指标体系

每个性能指标包含英文标识名、单位、计算公式和使用说明，确保 Agent 端采集与平台端存储/展示的一致性。

#### 3.2.1 延迟指标（Latency Metrics）

| 指标中文名 | 英文标识 | 单位 | 计算公式 | 说明 |
|-----------|----------|------|----------|------|
| 平均延迟 | `latency_ms_mean` | ms | `sum(latencies) / n` | 全部迭代的算术平均执行时间，反映总体水平 |
| P50 延迟 | `latency_ms_p50` | ms | `percentile(latencies, 50)` | 中位数延迟，不受极端值影响，最能代表"典型"体验 |
| P95 延迟 | `latency_ms_p95` | ms | `percentile(latencies, 95)` | 95 分位延迟，反映尾部延迟，SLA 常用指标 |
| P99 延迟 | `latency_ms_p99` | ms | `percentile(latencies, 99)` | 99 分位延迟，极端尾部延迟 |
| 最小延迟 | `latency_ms_min` | ms | `min(latencies)` | 最优执行时间，接近硬件理论下限 |
| 最大延迟 | `latency_ms_max` | ms | `max(latencies)` | 最差执行时间，反映抖动上限 |
| 延迟稳定性 | `latency_cv` | 无量纲 | `std(latencies) / mean(latencies)` | 变异系数（Coefficient of Variation），越小越稳定。CV < 0.1 为优秀 |
| 冷启动开销 | `warmup_overhead_ms` | ms | `avg(warmup_latencies) - avg(latencies)` | 预热阶段与稳态之间的延迟差异，反映 JIT 编译 / 缓存预热成本 |

#### 3.2.2 吞吐指标（Throughput Metrics）

| 指标中文名 | 英文标识 | 单位 | 计算公式 | 说明 |
|-----------|----------|------|----------|------|
| 吞吐量 | `throughput_ops` | ops/s | `iterations / total_wall_time` | 每秒可执行的算子次数 |
| GFLOPS | `gflops` | GFLOPS | `flops_per_op × throughput_ops / 1e9` | 每秒浮点运算吞吐量，需要根据算子类型计算 `flops_per_op`（见附录 A） |
| 算力利用率 | `compute_util_percent` | % | `actual_gflops / peak_gflops × 100` | 实际吞吐与芯片理论峰值的比值，Roofline 模型的核心指标 |

> **⚠️ `peak_gflops` 来源优先级（不硬编码在脚本里）：**
> 1. **芯片注册时填写的标称算力** —— 从芯片档案 API `GET /api/chips/{chipId}` 获取 `peakGflops` 字段
> 2. **运行时自动检测** —— LINPACK/HPL 简化版基准测试
> 3. **标注为 N/A** —— 以上都不可用时，不计算利用率，`compute_util_percent = null`
>
> **建议芯片注册（chips 表）新增字段：**
> ```sql
> ALTER TABLE chips ADD COLUMN IF NOT EXISTS peak_gflops_fp32 DOUBLE PRECISION;
> ALTER TABLE chips ADD COLUMN IF NOT EXISTS peak_gflops_fp16 DOUBLE PRECISION;
> ALTER TABLE chips ADD COLUMN IF NOT EXISTS peak_bandwidth_gbps DOUBLE PRECISION;
> ```

#### 3.2.3 资源指标（Resource Metrics）

| 指标中文名 | 英文标识 | 单位 | 计算公式 | 说明 |
|-----------|----------|------|----------|------|
| CPU/GPU 利用率 | `hw_util_percent` | % | `process_cpu_time / wall_time × 100` | CPU 场景为进程 CPU 时间占比；GPU 场景通过 `nvidia-smi` 或 `pynvml` 采集 |
| 内存占用 | `memory_mb` | MB | `peak_memory - baseline_memory` | 算子执行期间的增量内存占用（RSS） |
| 显存占用 | `vram_mb` | MB | `torch.cuda.max_memory_allocated()` | GPU 场景的显存峰值占用（仅 GPU 评测时采集） |

#### 3.2.4 指标采集伪代码

```python
def benchmark_operator(op_fn, op_config):
    """统一的算子性能评测入口"""
    warmup_iters = op_config.get("warmup", 10)
    test_iters = op_config.get("iterations", 100)
    
    # 1. 基线内存
    baseline_mem = get_memory_usage()
    
    # 2. Warmup（同时记录 warmup 延迟）
    warmup_latencies = []
    for _ in range(warmup_iters):
        t0 = perf_counter()
        op_fn()
        warmup_latencies.append((perf_counter() - t0) * 1000)
    
    # 3. 正式测试
    latencies = []
    cpu_start = process_time()
    wall_start = perf_counter()
    for _ in range(test_iters):
        t0 = perf_counter()
        op_fn()
        latencies.append((perf_counter() - t0) * 1000)
    wall_elapsed = perf_counter() - wall_start
    cpu_elapsed = process_time() - cpu_start
    
    # 4. 峰值内存
    peak_mem = get_memory_usage()
    
    # 5. 汇总
    return {
        "latency_ms_mean": mean(latencies),
        "latency_ms_p50": percentile(latencies, 50),
        "latency_ms_p95": percentile(latencies, 95),
        "latency_ms_p99": percentile(latencies, 99),
        "latency_ms_min": min(latencies),
        "latency_ms_max": max(latencies),
        "latency_cv": std(latencies) / mean(latencies),
        "warmup_overhead_ms": mean(warmup_latencies) - mean(latencies),
        "throughput_ops": test_iters / wall_elapsed,
        "gflops": compute_flops(op_config) * (test_iters / wall_elapsed) / 1e9,
        "compute_util_percent": compute_util(op_config, actual_gflops),
        "hw_util_percent": cpu_elapsed / wall_elapsed * 100,
        "memory_mb": peak_mem - baseline_mem,
    }
```

### 3.3 不同算子类型的关键指标差异

不同算子类型的 **计算/内存特征** 差异显著，评测时应关注不同的核心指标和特殊指标。

| 算子类型 | 代表算子 | 核心指标 | 特殊指标 | 说明 |
|----------|----------|----------|----------|------|
| 计算密集型 | MatMul, Conv2D, Conv3D, DepthwiseConv | `latency`, `throughput_ops`, `gflops`, `compute_util_percent` | FLOPs 计数、参数量、Roofline 位置（计算/内存 bound 判定） | 关注算力利用率，理想情况下应接近硬件峰值 |
| 归一化 | BatchNorm, LayerNorm, RMSNorm | `latency`, `memory_mb`, `throughput_ops` | `running_mean` / `running_var` 累积误差（BN 特有） | 内存带宽受限型，关注内存访问效率 |
| 激活函数 | ReLU, GELU, SiLU, Sigmoid | `latency`, `throughput_ops` | 数值范围验证、gradient 稳定性（GELU/SiLU 在零点附近） | 元素级操作，通常不是瓶颈，但精度敏感 |
| 池化 | MaxPool2D, AvgPool2D | `latency`, `throughput_ops`, `memory_mb` | 输出尺寸正确性验证（与 `stride`/`padding` 相关） | 需验证 shape 推导正确 |
| Attention（复合） | Attention | `latency`, `memory_mb`, `gflops` | 分步延迟（QK^T / Softmax / AV）、KV cache 大小、sequence length 对延迟的影响曲线 | 需要分步计时，是 Transformer 推理瓶颈 |
| 融合算子 | FusedConvBNReLU, MLP | `latency`, `throughput_ops`, `memory_mb` | 融合前后的 speedup ratio、内存节省比例 | 核心价值在于对比融合效果 |
| 通信算子 | AllReduce, AllGather 等 | `latency`, `throughput_ops` | 带宽利用率（`actual_bandwidth / peak_bandwidth`）、message size 对延迟的影响曲线 | 多卡场景，Phase 3 |

### 3.4 测试配置矩阵

#### 3.4.1 全局配置维度

| 维度 | 可选值 | 默认值 | 说明 |
|------|--------|--------|------|
| 数据类型 (dtype) | `FP32`, `FP16`, `BF16`, `INT8` | `FP32` | 不同精度影响计算速度和精度 |

> **⚠️ 多精度分期约束**
>
> | 数据类型 | Phase | 依赖 | 说明 |
> |----------|-------|------|------|
> | FP32 | Phase 1 | NumPy | 默认基线精度 |
> | FP16 | Phase 1 | NumPy float16 | CPU 可用，精度损失可接受 |
> | BF16 | Phase 2 | PyTorch / 硬件支持 | NumPy 无原生支持，需 `ml_dtypes` 库 |
> | INT8 | Phase 2 | 量化框架 | 需 Post-Training Quantization 或 QAT |
>
> **说明：** NumPy 原生不支持 BF16 和 INT8 量化模拟。BF16 需要 `ml_dtypes` 第三方库或 PyTorch；INT8 量化需要 PyTorch quantization 或 ONNX quantization 框架。**Phase 1 仅实现 FP32 + FP16，BF16 和 INT8 推到 Phase 2。**
| 输入尺寸 (size) | `Small(64)`, `Medium(512)`, `Large(2048)`, `XLarge(4096)` | `Medium(512)` | 括号内为矩阵/特征图边长基准值 |
| Batch Size | `1`, `4`, `16`, `64`, `256` | `16` | 批大小影响并行度和内存占用 |
| Warmup 迭代 | 可配置 | `10` | 预热次数，排除冷启动影响 |
| 测试迭代 | 可配置 | `100` | 正式测试次数，用于统计指标 |

#### 3.4.2 各算子的 Shape 定义规则

| 算子 | Shape 参数化规则 | Small | Medium | Large | XLarge |
|------|----------------|-------|--------|-------|--------|
| MatMul | `[B, M, K] × [B, K, N]`，M=K=N=size | [B,64,64]×[B,64,64] | [B,512,512]×[B,512,512] | [B,2048,2048]×[B,2048,2048] | [B,4096,4096]×[B,4096,4096] |
| Conv2D | `[B, Cin, H, W]`，Cin=64, H=W=size/4 | [B,64,16,16] | [B,64,128,128] | [B,64,512,512] | [B,64,1024,1024] |
| BatchNorm | 同 Conv2D 输入 | 同上 | 同上 | 同上 | 同上 |
| LayerNorm / RMSNorm | `[B, SeqLen, Hidden]`，SeqLen=size, Hidden=768 | [B,64,768] | [B,512,768] | [B,2048,768] | [B,4096,768] |
| Softmax | `[B, SeqLen, SeqLen]` | [B,64,64] | [B,512,512] | [B,2048,2048] | [B,4096,4096] |
| Attention | `[B, Heads, SeqLen, HeadDim]`，Heads=12, HeadDim=64 | SeqLen=64 | SeqLen=512 | SeqLen=2048 | SeqLen=4096 |
| Embedding | `[B, SeqLen]`，vocab=32000, dim=768 | SeqLen=64 | SeqLen=512 | SeqLen=2048 | SeqLen=4096 |

#### 3.4.3 测试组合策略

完整笛卡尔积组合数 = 算子数 × dtype数 × size数 × batch数 = 23 × 4 × 4 × 5 = **1840 个组合**。

实际采用 **分层策略** 控制测试规模：

- **快速验证模板：** 5 核心算子 × 1 dtype × 1 size × 2 batch = **10 组合**
- **标准评测模板：** 10 算子 × 2 dtype × 3 size × 3 batch = **180 组合**
- **全面评测模板：** 全部算子 × 4 dtype × 4 size × 5 batch = **1840 组合**

### 3.5 性能评测数据结构

Agent 端采集完成后，通过 `POST /api/tasks/{taskId}/result` 上报的性能数据结构：

```json
{
  "eval_type": "operator_performance",
  "version": "2.0",
  "system_info": {
    "chip": "Intel Xeon Gold 6248",
    "chip_id": 42,
    "arch": "x86_64",
    "cores_physical": 20,
    "cores_logical": 40,
    "memory_gb": 128.0,
    "gpu": null,
    "vram_gb": null,
    "os": "Linux 5.15.0",
    "framework": "numpy",
    "framework_version": "1.24.0",
    "peak_gflops_fp32": 1200.0
  },
  "config": {
    "template": "standard",
    "dtypes": ["FP32", "FP16"],
    "sizes": ["Small", "Medium", "Large"],
    "batch_sizes": [1, 16, 64],
    "warmup": 10,
    "iterations": 100
  },
  "results": [
    {
      "operator": "MatMul",
      "category": "compute_intensive",
      "dtype": "FP32",
      "size": "Medium",
      "batch_size": 16,
      "shape": {"input_a": [16, 512, 512], "input_b": [16, 512, 512]},
      "performance": {
        "latency_ms_mean": 2.341,
        "latency_ms_p50": 2.289,
        "latency_ms_p95": 2.876,
        "latency_ms_p99": 3.102,
        "latency_ms_min": 2.104,
        "latency_ms_max": 3.512,
        "latency_cv": 0.087,
        "warmup_overhead_ms": 1.23,
        "throughput_ops": 427.1,
        "gflops": 115.3,
        "compute_util_percent": 9.6,
        "hw_util_percent": 98.2,
        "memory_mb": 48.5,
        "vram_mb": null
      },
      "flops_per_op": 268435456,
      "status": "PASS"
    }
  ],
  "summary": {
    "total_operators": 10,
    "total_combinations": 180,
    "passed": 180,
    "failed": 0,
    "total_time_sec": 1847.3,
    "fastest_operator": {"name": "ReLU", "latency_ms_p50": 0.012},
    "slowest_operator": {"name": "Conv2D", "latency_ms_p50": 15.67},
    "highest_util_operator": {"name": "MatMul", "compute_util_percent": 9.6}
  }
}
```

---

## 四、算子精度评测方法设计（核心新增）

> **这是本文档的重点章节。** 当前系统完全缺失精度验证能力，本章从零定义精度评测的方法论、指标体系、阈值标准和数据结构。

### 4.1 精度验证方法论

精度验证需要回答一个核心问题：**待测算子的计算结果，相比"正确答案"偏差了多少？** 根据"正确答案"的来源不同，定义三种互补的验证方法。

#### 方法 1：参考实现对比法（Reference Comparison）

**原理：** 以高精度参考实现作为 ground truth，将待测算子的输出与参考输出逐元素对比。

**参考实现选择优先级：**
1. FP64（双精度）CPU 实现 —— 精度最高
2. 知名框架的 FP32 CPU 实现（如 PyTorch CPU、NumPy）—— 经过广泛验证
3. 数学定义的解析解（仅适用于特定算子，如 Softmax、ReLU）

**适用场景：**
- 验证 **芯片厂商算子实现** 的正确性（对比 GPU 实现 vs CPU FP64 参考）
- 验证 **算子融合** 后输出是否与未融合版本一致
- 验证 **不同框架** 对同一算子的实现差异

**执行流程：**
```
构造输入张量 x（使用固定 seed 确保可复现）
    → ref_output = reference_impl(x, dtype=FP64)
    → test_output = test_impl(x, dtype=目标精度)
    → metrics = compute_accuracy_metrics(test_output, ref_output)
    → verdict = check_thresholds(metrics, dtype=目标精度)
```

#### 方法 2：跨精度对比法（Cross-Precision Comparison）

**原理：** 以同一芯片的 FP32 实现作为基线（baseline），将低精度（FP16/BF16/INT8）实现的输出与 FP32 对比，量化精度损失。

**适用场景：**
- 评估 **量化（Quantization）** 带来的精度损失
- 评估 **混合精度训练** 中各算子的精度表现
- 支撑 "性能提升 vs 精度损失" 的 tradeoff 分析

**执行流程：**
```
构造输入张量 x（FP32）
    → baseline_output = impl(x, dtype=FP32)
    → for target_dtype in [FP16, BF16, INT8]:
        → target_input = cast(x, target_dtype)  # 输入量化
        → target_output = impl(target_input, target_dtype)
        → target_output_fp32 = cast(target_output, FP32)  # 回转 FP32 以便对比
        → metrics = compute_accuracy_metrics(target_output_fp32, baseline_output)
```

**关键细节：**
- INT8 量化需记录 `scale` 和 `zero_point`，反量化后再对比
- 对比时统一转为 FP32 计算误差，避免低精度下误差计算本身失真

#### 方法 3：数学性质验证法（Mathematical Property Verification）

**原理：** 验证算子输出是否满足其数学定义中的固有性质，不依赖参考实现。

**适用场景：**
- 作为快速正确性 **冒烟测试**（smoke test）
- 补充前两种方法未覆盖的 **边界条件** 验证
- 验证算子在 **极端输入**（very large / very small / NaN / Inf）下的行为

**各算子数学性质检查清单：**

| 算子 | 数学性质 | 验证条件 | 检查公式 |
|------|----------|----------|----------|
| Softmax | 输出和为 1 | 沿 softmax 维度 | `abs(sum(output, dim) - 1.0) ≤ 1e-6` |
| Softmax | 输出非负 | 所有元素 | `all(output ≥ 0)` |
| Softmax | 数值稳定性 | 输入含大值（>500） | `not any(isnan(output)) and not any(isinf(output))` |
| ReLU | 非负输出 | 所有元素 | `all(output ≥ 0)` |
| ReLU | 正值通过 | input > 0 部分 | `output[input > 0] == input[input > 0]` |
| Sigmoid | 输出范围 [0,1] | 所有元素 | `all(0 ≤ output ≤ 1)` |
| BatchNorm | 归一化后均值≈0 | eval mode，沿 batch 维 | `abs(mean(output)) ≤ 1e-5` |
| LayerNorm | 归一化后方差≈1 | 沿 hidden 维 | `abs(var(output) - 1.0) ≤ 1e-5` |
| RMSNorm | RMS≈1 | 沿 hidden 维 | `abs(rms(output) - 1.0) ≤ 1e-5` |
| MaxPool | 输出≤输入最大值 | 对应区域 | `output ≤ max(input)` |
| Embedding | 查表一致性 | 相同 index 相同输出 | `output[i] == weight[index[i]]` |

### 4.2 精度指标体系

#### 4.2.1 核心精度指标

| 指标中文名 | 英文标识 | 公式 | 适用场景 | 说明 |
|-----------|----------|------|----------|------|
| 最大绝对误差 | `max_abs_error` | `max(|y_test - y_ref|)` | 所有算子 | 输出中最大的绝对偏差，反映最坏情况 |
| 平均绝对误差 | `mean_abs_error` | `mean(|y_test - y_ref|)` | 所有算子 | 平均绝对偏差（MAE），反映整体偏差水平 |
| 最大相对误差 | `max_rel_error` | `max(|y_test - y_ref| / (|y_ref| + eps))` | 非零输出 | 最大比例偏差，`eps=1e-8` 防除零 |
| 平均相对误差 | `mean_rel_error` | `mean(|y_test - y_ref| / (|y_ref| + eps))` | 非零输出 | 平均比例偏差（MRE），反映整体相对精度 |
| 余弦相似度 | `cosine_similarity` | `dot(y_test, y_ref) / (‖y_test‖ × ‖y_ref‖)` | 向量输出 | 方向一致性指标，1.0 = 完全一致，对 scale 不敏感 |
| 均方误差 | `mse` | `mean((y_test - y_ref)²)` | 回归类 / 通用 | 误差能量，对大偏差敏感 |
| 信噪比 | `snr_db` | `10 × log10(‖y_ref‖² / ‖y_test - y_ref‖²)` | 信号处理类 | 越高越好，>40dB 通常认为高精度 |
| 通过率 | `pass_rate` | `passed_cases / total_cases × 100` | 批量测试 | 满足精度阈值的测试用例比例 |
| ULP 误差 | `ulp_error` | `|y_test - y_ref| / ulp(y_ref)` | 浮点精度分析 | 最后一位单位（Unit in the Last Place）的误差，IEEE 754 精度度量 |

> **ULP 说明：** 1 ULP 表示误差在浮点表示的最后一位以内。FP32 的 1 ULP ≈ 1.19e-7（在 1.0 附近），FP16 的 1 ULP ≈ 9.77e-4（在 1.0 附近）。

#### 4.2.2 精度指标采集伪代码

```python
import numpy as np

def compute_accuracy_metrics(y_test, y_ref, eps=1e-8):
    """计算全部精度指标
    
    Args:
        y_test: 待测输出，FP32 numpy array（低精度结果需先转回 FP32）
        y_ref: 参考输出，FP64 或 FP32 numpy array
        eps: 防除零常数
    
    Returns:
        dict: 全部精度指标
    """
    # 展平为一维以统一计算
    y_test_flat = y_test.flatten().astype(np.float64)
    y_ref_flat = y_ref.flatten().astype(np.float64)
    
    diff = np.abs(y_test_flat - y_ref_flat)
    rel_diff = diff / (np.abs(y_ref_flat) + eps)
    
    # 核心指标
    metrics = {
        "max_abs_error": float(np.max(diff)),
        "mean_abs_error": float(np.mean(diff)),
        "max_rel_error": float(np.max(rel_diff)),
        "mean_rel_error": float(np.mean(rel_diff)),
        "mse": float(np.mean(diff ** 2)),
    }
    
    # 余弦相似度
    norm_test = np.linalg.norm(y_test_flat)
    norm_ref = np.linalg.norm(y_ref_flat)
    if norm_test > 0 and norm_ref > 0:
        metrics["cosine_similarity"] = float(
            np.dot(y_test_flat, y_ref_flat) / (norm_test * norm_ref)
        )
    else:
        metrics["cosine_similarity"] = 1.0 if np.allclose(y_test_flat, y_ref_flat) else 0.0
    
    # 信噪比
    signal_power = np.sum(y_ref_flat ** 2)
    noise_power = np.sum(diff ** 2)
    if noise_power > 0:
        metrics["snr_db"] = float(10 * np.log10(signal_power / noise_power))
    else:
        metrics["snr_db"] = float('inf')
    
    # ULP 误差（仅 FP32 有意义）
    # ulp(x) = nextafter(|x|, inf) - |x|
    abs_ref = np.abs(y_ref_flat)
    ulps = np.nextafter(abs_ref, np.inf) - abs_ref
    ulps = np.where(ulps > 0, ulps, eps)
    metrics["ulp_error_max"] = float(np.max(diff / ulps))
    metrics["ulp_error_mean"] = float(np.mean(diff / ulps))
    
    return metrics
```

### 4.3 精度阈值标准（初始推荐值，需根据实际数据调校）

精度阈值参考 DeepLink AIChipBenchmark 验证标准、ONNX Runtime conformance tests 默认容差、以及 IEEE 754 浮点精度理论值。

#### 4.3.1 通用阈值（适用于大多数算子）

| 数据类型 | `max_abs_error` | `max_rel_error` | `cosine_similarity` | `snr_db` | 说明 |
|----------|-----------------|-----------------|---------------------|----------|------|
| FP32 | ≤ 1e-5 | ≤ 1e-4 | ≥ 0.99999 | ≥ 80 dB | 对标 FP64 参考，FP32 有 ~7 位有效数字 |
| FP16 | ≤ 1e-2 | ≤ 1e-2 | ≥ 0.999 | ≥ 40 dB | FP16 有 ~3.3 位有效数字，精度损失显著 |
| BF16 | ≤ 1e-2 | ≤ 5e-2 | ≥ 0.99 | ≥ 30 dB | BF16 指数范围同 FP32 但尾数仅 7bit |
| INT8 | ≤ 0.5 | ≤ 0.1 | ≥ 0.95 | ≥ 20 dB | 量化误差大，但应在可接受范围内 |

#### 4.3.2 算子特定阈值覆盖

部分算子因其计算特性，需要更宽松或更严格的阈值：

| 算子 | 数据类型 | 覆盖阈值 | 原因 |
|------|----------|----------|------|
| MatMul (size≥2048) | FP32 | `max_abs_error ≤ 1e-3` | 大矩阵乘法累积误差，FMA 顺序影响 |
| Softmax | FP16 | `max_abs_error ≤ 5e-2` | exp 函数在大值输入下放大误差 |
| Conv2D (large kernel) | FP32 | `max_abs_error ≤ 1e-4` | 大卷积核累积误差 |
| BatchNorm (training) | FP32 | `running_mean_error ≤ 1e-4` | running stats 有累积误差 |

#### 4.3.3 精度判定逻辑

```python
def check_accuracy_verdict(metrics, dtype, operator_name):
    """精度判定：PASS / WARNING / FAIL
    
    判定规则：
    - PASS: 全部核心指标在阈值内
    - WARNING: max_abs_error 或 max_rel_error 超阈值但 cosine_similarity 在阈值内
    - FAIL: cosine_similarity 不达标 或 多个指标同时超标
    """
    thresholds = get_thresholds(dtype, operator_name)
    
    checks = {
        "max_abs_error": metrics["max_abs_error"] <= thresholds["max_abs_error"],
        "max_rel_error": metrics["max_rel_error"] <= thresholds["max_rel_error"],
        "cosine_similarity": metrics["cosine_similarity"] >= thresholds["cosine_similarity"],
    }
    
    if all(checks.values()):
        return "PASS"
    elif checks["cosine_similarity"]:
        return "WARNING"  # 方向一致但数值有偏差
    else:
        return "FAIL"
```

> **⚠️ 阈值校准机制**
> 1. 以上阈值为初始推荐值，基于 DeepLink / ONNX Runtime conformance tests 的经验数据
> 2. Phase 1 上线后，收集实际评测数据（建议 100+ 组算子评测结果），统计各指标的分布情况
> 3. 根据实际数据的 P95/P99 分位值，调校阈值到合理范围
> 4. 阈值存储在数据库配置表中（不硬编码在脚本里），可通过管理后台动态调整
> 5. 建议将阈值配置抽象为 JSON Schema，支持按算子类型、数据类型分别配置

### 4.4 各算子精度验证要点

| 算子 | 验证方法 | 特殊验证点 | 边界输入测试 |
|------|----------|-----------|------------|
| **Softmax** | 方法 1 + 方法 3 | ① 输出和 = 1（`sum_error ≤ 1e-6`）<br>② 数值稳定性（输入含 >500 的大值不溢出）<br>③ 输出单调性（输入越大输出越大） | `x = [1000, 1000, 1000]`（大值）<br>`x = [-1000, 0, 1000]`（极端范围）<br>`x = [0, 0, 0]`（均匀分布，应输出 1/n） |
| **BatchNorm** | 方法 1 + 方法 3 | ① `running_mean` / `running_var` 累积误差<br>② train mode 与 eval mode 输出一致性<br>③ momentum 参数影响 | `x = randn * 100`（大方差输入）<br>batch_size=1（退化情况） |
| **MatMul** | 方法 1 + 方法 2 | ① 大矩阵（≥2048）的累积误差<br>② 对称性验证：`A×B` vs `(B^T×A^T)^T`<br>③ 单位矩阵乘法：`A×I = A` | `A = eye(n)`（单位矩阵）<br>`A, B` 含极小值（1e-7） |
| **Conv2D** | 方法 1 | ① 边界填充（padding）正确性<br>② `stride` / `dilation` 下输出尺寸验证<br>③ `groups > 1` 的分组卷积正确性 | `stride=1,2,4`<br>`dilation=1,2,3`<br>`padding=same/valid` |
| **ReLU** | 方法 1 + 方法 3 | ① 零点行为：`ReLU(0) = 0`<br>② 负值截断：`ReLU(x<0) = 0`<br>③ 正值通过：`ReLU(x>0) = x` | `x = [-eps, 0, eps]`（零点附近）<br>`x = [-1e30, 1e30]`（极值） |
| **GELU / SiLU** | 方法 1 | ① 零点附近行为（GELU(0) ≈ 0, SiLU(0) = 0）<br>② 与标准公式的近似误差（tanh 近似 vs erf 精确） | `x = linspace(-5, 5, 10000)` |
| **LayerNorm / RMSNorm** | 方法 1 + 方法 3 | ① 归一化后方差 = 1 验证<br>② LN: 归一化后均值 = 0<br>③ 不同 hidden_size 下精度差异 | `hidden_size = [64, 768, 4096]`<br>`x` 含 outlier 值 |
| **Embedding** | 方法 3 | ① 查表一致性：`output[i] == weight[index[i]]`<br>② 越界 index 处理（应 error 或 wrap） | `index = [0, vocab_size-1]`（边界）<br>`index` 含重复值 |

### 4.5 精度评测数据结构

Agent 上报的精度评测数据嵌入到算子评测结果中：

```json
{
  "eval_type": "operator_accuracy",
  "version": "2.0",
  "system_info": { "...同性能评测..." },
  "config": {
    "reference_impl": "numpy_fp64",
    "methods": ["reference_comparison", "cross_precision", "math_property"],
    "random_seed": 42,
    "dtypes_to_test": ["FP32", "FP16", "BF16", "INT8"]
  },
  "results": [
    {
      "operator": "Softmax",
      "category": "activation",
      "shape": {"input": [16, 512, 512]},
      "accuracy_tests": [
        {
          "method": "reference_comparison",
          "test_dtype": "FP32",
          "ref_dtype": "FP64",
          "ref_impl": "numpy",
          "metrics": {
            "max_abs_error": 2.38e-7,
            "mean_abs_error": 1.05e-8,
            "max_rel_error": 3.72e-6,
            "mean_rel_error": 8.91e-8,
            "cosine_similarity": 0.999999998,
            "mse": 1.12e-16,
            "snr_db": 142.3,
            "ulp_error_max": 2.01,
            "ulp_error_mean": 0.089
          },
          "thresholds": {
            "max_abs_error": 1e-5,
            "max_rel_error": 1e-4,
            "cosine_similarity": 0.99999
          },
          "verdict": "PASS"
        },
        {
          "method": "cross_precision",
          "test_dtype": "FP16",
          "ref_dtype": "FP32",
          "ref_impl": "same_chip",
          "metrics": {
            "max_abs_error": 3.91e-3,
            "mean_abs_error": 2.07e-4,
            "max_rel_error": 8.33e-3,
            "mean_rel_error": 4.12e-4,
            "cosine_similarity": 0.99987,
            "mse": 5.67e-7,
            "snr_db": 52.1
          },
          "thresholds": {
            "max_abs_error": 1e-2,
            "max_rel_error": 1e-2,
            "cosine_similarity": 0.999
          },
          "verdict": "PASS"
        },
        {
          "method": "cross_precision",
          "test_dtype": "INT8",
          "ref_dtype": "FP32",
          "ref_impl": "same_chip",
          "quantization": {
            "scheme": "symmetric",
            "scale": 0.00392156,
            "zero_point": 0
          },
          "metrics": {
            "max_abs_error": 0.187,
            "mean_abs_error": 0.031,
            "max_rel_error": 0.067,
            "mean_rel_error": 0.012,
            "cosine_similarity": 0.9821,
            "mse": 0.00142,
            "snr_db": 24.7
          },
          "thresholds": {
            "max_abs_error": 0.5,
            "max_rel_error": 0.1,
            "cosine_similarity": 0.95
          },
          "verdict": "PASS"
        },
        {
          "method": "math_property",
          "test_dtype": "FP32",
          "properties": [
            {
              "name": "output_sum_equals_one",
              "formula": "abs(sum(output, dim=-1) - 1.0) ≤ 1e-6",
              "max_error": 8.94e-8,
              "passed": true
            },
            {
              "name": "output_non_negative",
              "formula": "all(output ≥ 0)",
              "passed": true
            },
            {
              "name": "numerical_stability_large_input",
              "formula": "not any(isnan(output)) when input > 500",
              "passed": true
            }
          ],
          "verdict": "PASS"
        }
      ],
      "overall_verdict": "PASS"
    }
  ],
  "summary": {
    "total_operators": 16,
    "total_accuracy_tests": 128,
    "pass": 125,
    "warning": 2,
    "fail": 1,
    "pass_rate": 97.66,
    "worst_operator": {
      "name": "MatMul",
      "dtype": "INT8",
      "cosine_similarity": 0.9412,
      "verdict": "FAIL"
    }
  }
}
```

---

## 五、芯片/优化前后对比设计

> **⚠️ 对比功能整体归入 Phase 2 实施**
>
> Phase 1 专注于精度验证基础和性能指标增强，对比 API 和前端对比展示推到 Phase 2。
> Phase 1 的产出（标准化的性能 + 精度指标）为 Phase 2 对比功能提供数据基础。

### 5.1 对比维度

系统支持三种对比维度，每种对比回答不同的业务问题：

| 对比维度 | 英文标识 | 业务问题 | Baseline | Target | 核心关注指标 |
|----------|---------|----------|----------|--------|-------------|
| 跨芯片对比 | `cross_chip` | "华为昇腾 vs Intel CPU 哪个快？" | 芯片 A 的评测结果 | 芯片 B 的评测结果 | latency speedup, throughput gain, compute_util |
| 跨精度对比 | `cross_precision` | "FP16 比 FP32 快多少？精度损失多少？" | FP32 评测结果 | FP16/BF16/INT8 结果 | latency speedup vs accuracy loss（tradeoff） |
| 优化前后对比 | `optimization` | "Conv+BN+ReLU 融合后提升多少？" | 未优化版本 | 优化后版本 | latency reduction, memory saving |

### 5.2 对比报告数据结构

```json
{
  "comparison_id": "cmp_20260408_001",
  "comparison_type": "cross_chip",
  "created_at": "2026-04-08T14:30:00+08:00",
  "baseline": {
    "plan_id": 123,
    "task_id": 456,
    "chip": {
      "id": 42,
      "name": "Intel Xeon Gold 6248",
      "vendor": "Intel",
      "arch": "x86_64"
    },
    "precision": "FP32",
    "eval_version": "v2.0",
    "eval_date": "2026-04-05T10:00:00+08:00"
  },
  "target": {
    "plan_id": 124,
    "task_id": 789,
    "chip": {
      "id": 55,
      "name": "Huawei Ascend 910B",
      "vendor": "Huawei",
      "arch": "DaVinci"
    },
    "precision": "FP32",
    "eval_version": "v2.0",
    "eval_date": "2026-04-06T15:00:00+08:00"
  },
  "dimensions": ["performance", "accuracy"],
  "operator_comparisons": [
    {
      "operator": "MatMul",
      "category": "compute_intensive",
      "configs_compared": [
        {
          "dtype": "FP32",
          "size": "Medium",
          "batch_size": 16,
          "baseline_performance": {
            "latency_ms_p50": 1.76,
            "latency_ms_p95": 2.31,
            "throughput_ops": 517,
            "gflops": 28.5,
            "compute_util_percent": 2.4,
            "memory_mb": 48.2
          },
          "target_performance": {
            "latency_ms_p50": 0.92,
            "latency_ms_p95": 1.15,
            "throughput_ops": 1024,
            "gflops": 56.3,
            "compute_util_percent": 18.1,
            "memory_mb": 52.1
          },
          "performance_delta": {
            "latency_speedup": 1.91,
            "latency_speedup_display": "1.91x",
            "throughput_gain_percent": 98.1,
            "throughput_gain_display": "+98%",
            "gflops_gain_percent": 97.5,
            "compute_util_diff": 15.7,
            "memory_diff_mb": 3.9,
            "memory_diff_display": "+8%"
          },
          "baseline_accuracy": {
            "max_abs_error": 2.38e-7,
            "cosine_similarity": 0.999999998,
            "verdict": "PASS"
          },
          "target_accuracy": {
            "max_abs_error": 1.05e-6,
            "cosine_similarity": 0.999999912,
            "verdict": "PASS"
          },
          "accuracy_delta": {
            "max_abs_error_ratio": 4.41,
            "cosine_similarity_diff": -8.6e-8,
            "verdict_match": true
          }
        }
      ]
    },
    {
      "operator": "Softmax",
      "category": "activation",
      "configs_compared": ["... 同上结构 ..."]
    }
  ],
  "summary": {
    "total_operators_compared": 10,
    "performance_summary": {
      "avg_latency_speedup": 1.85,
      "median_latency_speedup": 1.72,
      "best_speedup": {"operator": "MatMul", "speedup": 1.91},
      "worst_speedup": {"operator": "Softmax", "speedup": 0.98},
      "operators_faster": 8,
      "operators_slower": 1,
      "operators_similar": 1
    },
    "accuracy_summary": {
      "both_pass": 9,
      "baseline_better": 1,
      "target_better": 0,
      "both_fail": 0
    },
    "recommendation": "Ascend 910B 在计算密集型算子（MatMul, Conv2D）上表现显著优于 Intel Xeon，平均加速 1.85x；归一化和激活类算子性能接近。精度方面两者均通过阈值验证。"
  }
}
```

### 5.3 对比 API 设计

#### 5.3.1 创建对比报告

```
POST /api/reports/compare
Content-Type: application/json
Authorization: Bearer {token}

Request Body:
{
  "baseline_plan_id": 123,
  "target_plan_id": 456,
  "dimensions": ["performance", "accuracy"],
  "operator_filter": null,
  "config_filter": {
    "dtypes": ["FP32"],
    "sizes": ["Medium"],
    "batch_sizes": [16]
  }
}

Response (200):
{
  "code": 0,
  "message": "success",
  "data": {
    "comparison_id": "cmp_20260408_001",
    "status": "completed",
    "report": { "...对比报告完整结构（见 5.2）..." }
  }
}

Error Response (400):
{
  "code": 1001,
  "message": "baseline_plan_id 和 target_plan_id 的评测类型不一致，无法对比"
}

Error Response (404):
{
  "code": 1002,
  "message": "Plan 123 不存在或尚无评测结果"
}
```

#### 5.3.2 获取对比报告

```
GET /api/reports/compare/{comparison_id}
Authorization: Bearer {token}

Response (200):
{
  "code": 0,
  "data": { "...对比报告完整结构..." }
}
```

#### 5.3.3 列表查询对比报告

```
GET /api/reports/compare?page=0&size=20&type=cross_chip&chip_id=42
Authorization: Bearer {token}

Response (200):
{
  "code": 0,
  "data": {
    "items": [
      {
        "comparison_id": "cmp_20260408_001",
        "comparison_type": "cross_chip",
        "baseline_chip": "Intel Xeon Gold 6248",
        "target_chip": "Huawei Ascend 910B",
        "created_at": "2026-04-08T14:30:00+08:00",
        "summary": { "avg_latency_speedup": 1.85, "operators_compared": 10 }
      }
    ],
    "total": 5,
    "page": 0,
    "size": 20
  }
}
```

#### 5.3.4 跨精度 Tradeoff 分析 API

专为"性能提升 vs 精度损失"的 tradeoff 分析设计：

```
POST /api/reports/precision-tradeoff
Content-Type: application/json

Request Body:
{
  "plan_id": 123,
  "baseline_dtype": "FP32",
  "target_dtypes": ["FP16", "BF16", "INT8"]
}

Response (200):
{
  "code": 0,
  "data": {
    "plan_id": 123,
    "chip": "Intel Xeon Gold 6248",
    "operators": [
      {
        "operator": "MatMul",
        "tradeoffs": [
          {
            "target_dtype": "FP16",
            "latency_speedup": 1.82,
            "throughput_gain_percent": 78.5,
            "accuracy_loss": {
              "max_abs_error": 3.91e-3,
              "cosine_similarity": 0.99987,
              "verdict": "PASS"
            },
            "recommendation": "推荐使用，精度损失可接受"
          },
          {
            "target_dtype": "INT8",
            "latency_speedup": 3.12,
            "throughput_gain_percent": 210.0,
            "accuracy_loss": {
              "max_abs_error": 0.42,
              "cosine_similarity": 0.9412,
              "verdict": "FAIL"
            },
            "recommendation": "⚠️ 精度损失超过阈值，需校准后重新评估"
          }
        ]
      }
    ]
  }
}
```

### 5.4 前端对比展示

#### 5.4.1 图表类型与适用场景

| 图表类型 | 适用对比维度 | 展示内容 | 交互功能 |
|----------|-------------|----------|----------|
| **分组柱状图** | 跨芯片、优化前后 | 同组算子的 latency_p50 / throughput 对比，baseline（蓝）vs target（橙） | 悬停显示详情、点击进入算子详情页 |
| **雷达图** | 跨芯片 | 多维指标综合对比（latency / throughput / gflops / memory / accuracy），归一化到 0-100 | 选择要展示的指标维度 |
| **热力图** | 跨精度 | 精度损失矩阵，行=算子，列=数据类型，颜色=精度损失程度（绿=PASS / 黄=WARNING / 红=FAIL） | 点击单元格查看详细精度指标 |
| **详细对比表格** | 全部维度 | 完整指标对比 + 涨跌标识（↑ 绿色提升 / ↓ 红色下降 / − 灰色持平） | 排序、筛选、导出 CSV |
| **折线图** | 跨精度 | Latency speedup vs Accuracy loss 的 tradeoff 曲线 | 悬停查看具体数值 |

#### 5.4.2 对比表格列定义

```
┌─────────────┬────────────────────┬────────────────────┬──────────────────┐
│   算子名     │  Baseline (芯片A)   │  Target (芯片B)     │   Delta          │
├─────────────┼────────────────────┼────────────────────┼──────────────────┤
│ MatMul      │ P50: 1.76ms        │ P50: 0.92ms        │ ↑ 1.91x faster   │
│             │ Throughput: 517    │ Throughput: 1024   │ ↑ +98%           │
│             │ GFLOPS: 28.5       │ GFLOPS: 56.3       │ ↑ +97%           │
│             │ Accuracy: PASS     │ Accuracy: PASS     │ − 持平            │
├─────────────┼────────────────────┼────────────────────┼──────────────────┤
│ Softmax     │ P50: 0.43ms        │ P50: 0.44ms        │ − ~1.0x          │
│             │ Throughput: 2215   │ Throughput: 2198   │ − -1%            │
│             │ Accuracy: PASS     │ Accuracy: PASS     │ − 持平            │
└─────────────┴────────────────────┴────────────────────┴──────────────────┘

涨跌标识规则：
  ↑ 绿色 (#52c41a)：性能提升 > 5% 或精度更优
  ↓ 红色 (#f5222d)：性能下降 > 5% 或精度更差
  − 灰色 (#8c8c8c)：变化在 ±5% 以内
```

#### 5.4.3 热力图配色方案

```
精度损失热力图配色：
  PASS   (cosine_sim ≥ threshold):  #f6ffed (浅绿底) + #52c41a (绿文字)
  WARNING (cosine_sim 略低):         #fffbe6 (浅黄底) + #faad14 (橙文字)  
  FAIL   (cosine_sim < threshold):  #fff1f0 (浅红底) + #f5222d (红文字)
  N/A    (未测试):                   #fafafa (灰底)   + #bfbfbf (灰文字)
```

---

## 六、评测流程与模板设计

### 6.1 算子评测完整流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                        算子评测完整流程                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [用户] 选择目标芯片                                                  │
│    ↓                                                                 │
│  [用户] 选择评测模板（快速验证 / 标准评测 / 全面评测 / 自定义）          │
│    ↓                                                                 │
│  [用户] 配置参数（可选修改：算子清单、精度、尺寸、迭代次数）              │
│    ↓                                                                 │
│  [系统] 参数校验 → 创建 EvaluationPlan                                │
│    ↓                                                                 │
│  [系统] 根据 Plan 生成 EvaluationTask → 分发到目标节点 Agent            │
│    ↓                                                                 │
│  [Agent] 接收 Task，开始执行：                                         │
│    │                                                                 │
│    ├─ ① 收集系统信息（CPU/GPU/内存/OS/框架版本）                       │
│    │                                                                 │
│    ├─ ② 遍历每个算子 × 每个配置组合：                                  │
│    │   │                                                             │
│    │   ├─ a. 性能测试                                                │
│    │   │   ├─ Warmup（N 次）                                         │
│    │   │   ├─ 正式迭代（M 次），逐次记录延迟                           │
│    │   │   ├─ 统计延迟分布（mean/p50/p95/p99/min/max/cv）            │
│    │   │   ├─ 计算吞吐量、GFLOPS、算力利用率                          │
│    │   │   └─ 采集内存/显存占用                                       │
│    │   │                                                             │
│    │   ├─ b. 精度测试（如果模板包含精度验证）                           │
│    │   │   ├─ 生成参考输出（FP64 / FP32 baseline）                    │
│    │   │   ├─ 执行待测算子                                            │
│    │   │   ├─ 计算精度指标（9 个指标）                                 │
│    │   │   ├─ 比对阈值，判定 PASS/WARNING/FAIL                       │
│    │   │   └─ 数学性质验证（算子特定）                                 │
│    │   │                                                             │
│    │   └─ c. 记录本组合结果                                           │
│    │                                                                 │
│    ├─ ③ 融合算子测试（如果模板包含）                                    │
│    │   ├─ 分别执行未融合版本和融合版本                                  │
│    │   └─ 对比性能和精度差异                                           │
│    │                                                                 │
│    └─ ④ 汇总报告 → POST /api/tasks/{taskId}/result 上报平台           │
│                                                                      │
│  [系统] 接收结果 → 解析存储 → 触发评分                                 │
│    ↓                                                                 │
│  [系统] 自动生成评测报告                                               │
│    ├─ 性能排名（按算子/按配置）                                        │
│    ├─ 精度验证汇总（通过率、失败项高亮）                                │
│    └─ 自动对比分析（如果有历史数据 / 其他芯片数据）                      │
│                                                                      │
│  [用户] 查看报告 → 可选发起对比（选择另一份报告进行对比分析）             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 评测模板预设

#### 6.2.1 快速验证模板

| 属性 | 值 |
|------|-----|
| **模板名** | `operator_quick` |
| **适用场景** | 新芯片接入后的冒烟测试、开发调试 |
| **算子数** | 5 个核心算子：MatMul, Conv2D, Softmax, LayerNorm, ReLU |
| **数据类型** | FP32 |
| **输入尺寸** | Medium (512) |
| **Batch Size** | 1, 16 |
| **迭代次数** | warmup=5, iterations=50 |
| **精度测试** | ✅ 基础（仅方法 1 参考对比 + 方法 3 数学性质） |
| **融合测试** | ❌ 不含 |
| **预估时间** | ~5 分钟 |
| **总组合数** | 5 × 1 × 1 × 2 = 10 |

#### 6.2.2 标准评测模板

| 属性 | 值 |
|------|-----|
| **模板名** | `operator_standard` |
| **适用场景** | 芯片能力评估、选型对比 |
| **算子数** | 10 个常用算子：MatMul, Conv2D, DepthwiseConv, BatchNorm, LayerNorm, ReLU, GELU, Softmax, MaxPool, Attention |
| **数据类型** | FP32, FP16 |
| **输入尺寸** | Small, Medium, Large |
| **Batch Size** | 1, 16, 64 |
| **迭代次数** | warmup=10, iterations=100 |
| **精度测试** | ✅ 完整（方法 1 + 方法 2 + 方法 3） |
| **融合测试** | ❌ 不含 |
| **预估时间** | ~30 分钟 |
| **总组合数** | 10 × 2 × 3 × 3 = 180 |

#### 6.2.3 全面评测模板

| 属性 | 值 |
|------|-----|
| **模板名** | `operator_comprehensive` |
| **适用场景** | 芯片深度评估、发布报告、对标竞品 |
| **算子数** | 全部 19 个算子（不含通信算子） |
| **数据类型** | FP32, FP16, BF16, INT8 |
| **输入尺寸** | Small, Medium, Large, XLarge |
| **Batch Size** | 1, 4, 16, 64, 256 |
| **迭代次数** | warmup=10, iterations=200 |
| **精度测试** | ✅ 完整 + 跨精度 tradeoff 分析 |
| **融合测试** | ✅ FusedConvBNReLU + MLP 融合前后对比 |
| **预估时间** | ~2 小时 |
| **总组合数** | 19 × 4 × 4 × 5 = 1520 |

#### 6.2.4 模板 JSON Schema

```json
{
  "template_name": "operator_standard",
  "template_version": "2.0",
  "eval_layer": "operator",
  "display_name": "算子标准评测",
  "description": "覆盖 10 个常用算子，FP32+FP16 双精度，包含完整精度验证",
  "estimated_duration_min": 30,
  "config": {
    "operators": [
      {"name": "MatMul", "enabled": true, "shapes": "auto"},
      {"name": "Conv2D", "enabled": true, "shapes": "auto"},
      {"name": "DepthwiseConv", "enabled": true, "shapes": "auto"},
      {"name": "BatchNorm", "enabled": true, "shapes": "auto"},
      {"name": "LayerNorm", "enabled": true, "shapes": "auto"},
      {"name": "ReLU", "enabled": true, "shapes": "auto"},
      {"name": "GELU", "enabled": true, "shapes": "auto"},
      {"name": "Softmax", "enabled": true, "shapes": "auto"},
      {"name": "MaxPool2D", "enabled": true, "shapes": "auto"},
      {"name": "Attention", "enabled": true, "shapes": "auto"}
    ],
    "dtypes": ["FP32", "FP16"],
    "sizes": ["Small", "Medium", "Large"],
    "batch_sizes": [1, 16, 64],
    "warmup": 10,
    "iterations": 100,
    "accuracy": {
      "enabled": true,
      "methods": ["reference_comparison", "cross_precision", "math_property"],
      "reference_impl": "auto",
      "random_seed": 42
    },
    "fusion": {
      "enabled": false
    }
  }
}
```

### 6.3 Agent 端执行协议

#### 6.3.1 Task Payload（平台 → Agent）

```json
{
  "task_id": 789,
  "plan_id": 123,
  "eval_type": "operator",
  "script": "operator_benchmark_v2.py",
  "params": {
    "template": "operator_standard",
    "operators": ["MatMul", "Conv2D", "Softmax", "..."],
    "dtypes": ["FP32", "FP16"],
    "sizes": ["Small", "Medium", "Large"],
    "batch_sizes": [1, 16, 64],
    "warmup": 10,
    "iterations": 100,
    "accuracy": {
      "enabled": true,
      "methods": ["reference_comparison", "cross_precision", "math_property"],
      "random_seed": 42
    }
  },
  "timeout_sec": 3600
}
```

#### 6.3.2 Agent 执行脚本入口

Agent 接收 Task 后，调用升级版 `operator_benchmark_v2.py`：

```bash
python3 operator_benchmark_v2.py '{
  "operators": ["MatMul", "Conv2D", ...],
  "dtypes": ["FP32", "FP16"],
  "sizes": ["Small", "Medium", "Large"],
  "batch_sizes": [1, 16, 64],
  "warmup": 10,
  "iterations": 100,
  "accuracy": {"enabled": true, "methods": [...], "random_seed": 42}
}'
```

脚本输出 JSON 到 stdout，Agent 捕获后 POST 到 `/api/tasks/{taskId}/result`。

#### 6.3.3 进度上报

Agent 在执行过程中应定期上报进度（复用已有的 Task Log 机制）：

```
POST /api/tasks/{taskId}/log
{
  "level": "INFO",
  "source": "operator_benchmark",
  "message": "[5/180] MatMul FP32 Medium batch=16 — latency_p50=2.29ms PASS",
  "progress_percent": 2.8
}
```

---

## 七、数据模型设计

### 7.1 算子评测结果表

新增 `operator_perf_results` 表，存储单算子单配置粒度的性能数据（从 `evaluation_results.raw_data` JSON 中拆出来，支持 SQL 查询和对比）：

```sql
CREATE TABLE operator_perf_results (
    id              BIGSERIAL PRIMARY KEY,
    result_id       BIGINT NOT NULL REFERENCES evaluation_results(id),
    task_id         BIGINT NOT NULL,
    plan_id         BIGINT NOT NULL,
    chip_id         BIGINT NOT NULL,
    
    -- 算子信息
    operator_name   VARCHAR(64) NOT NULL,         -- 如 'MatMul', 'Conv2D'
    category        VARCHAR(32) NOT NULL,         -- 如 'compute_intensive', 'activation'
    
    -- 测试配置
    dtype           VARCHAR(8) NOT NULL,          -- 'FP32', 'FP16', 'BF16', 'INT8'
    size_label      VARCHAR(16) NOT NULL,         -- 'Small', 'Medium', 'Large', 'XLarge'
    batch_size      INT NOT NULL,
    input_shape     JSONB,                        -- {"input_a": [16,512,512], "input_b": [16,512,512]}
    
    -- 性能指标
    latency_ms_mean DOUBLE PRECISION,
    latency_ms_p50  DOUBLE PRECISION,
    latency_ms_p95  DOUBLE PRECISION,
    latency_ms_p99  DOUBLE PRECISION,
    latency_ms_min  DOUBLE PRECISION,
    latency_ms_max  DOUBLE PRECISION,
    latency_cv      DOUBLE PRECISION,
    warmup_overhead_ms DOUBLE PRECISION,
    throughput_ops  DOUBLE PRECISION,
    gflops          DOUBLE PRECISION,
    compute_util_percent DOUBLE PRECISION,
    hw_util_percent DOUBLE PRECISION,
    memory_mb       DOUBLE PRECISION,
    vram_mb         DOUBLE PRECISION,
    
    -- 元数据
    flops_per_op    BIGINT,
    status          VARCHAR(8) DEFAULT 'PASS',    -- 'PASS', 'FAIL', 'ERROR'
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    -- 索引
    CONSTRAINT idx_opr_unique UNIQUE (result_id, operator_name, dtype, size_label, batch_size)
);

CREATE INDEX idx_opr_chip ON operator_perf_results(chip_id);
CREATE INDEX idx_opr_operator ON operator_perf_results(operator_name);
CREATE INDEX idx_opr_plan ON operator_perf_results(plan_id);
```

### 7.2 精度验证结果表

```sql
CREATE TABLE operator_accuracy_results (
    id              BIGSERIAL PRIMARY KEY,
    result_id       BIGINT NOT NULL REFERENCES evaluation_results(id),
    task_id         BIGINT NOT NULL,
    plan_id         BIGINT NOT NULL,
    chip_id         BIGINT NOT NULL,
    
    -- 算子信息
    operator_name   VARCHAR(64) NOT NULL,
    
    -- 验证配置
    method          VARCHAR(32) NOT NULL,         -- 'reference_comparison', 'cross_precision', 'math_property'
    test_dtype      VARCHAR(8) NOT NULL,          -- 被测精度
    ref_dtype       VARCHAR(8),                   -- 参考精度（方法1/2）
    ref_impl        VARCHAR(32),                  -- 'numpy_fp64', 'same_chip', ...
    input_shape     JSONB,
    
    -- 精度指标
    max_abs_error       DOUBLE PRECISION,
    mean_abs_error      DOUBLE PRECISION,
    max_rel_error       DOUBLE PRECISION,
    mean_rel_error      DOUBLE PRECISION,
    cosine_similarity   DOUBLE PRECISION,
    mse                 DOUBLE PRECISION,
    snr_db              DOUBLE PRECISION,
    ulp_error_max       DOUBLE PRECISION,
    ulp_error_mean      DOUBLE PRECISION,
    
    -- 数学性质验证（方法3）
    math_properties     JSONB,                    -- [{"name": "output_sum_equals_one", "passed": true, ...}]
    
    -- 判定
    verdict         VARCHAR(8) NOT NULL,          -- 'PASS', 'WARNING', 'FAIL'
    threshold_config JSONB,                       -- 使用的阈值配置
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT idx_oar_unique UNIQUE (result_id, operator_name, method, test_dtype)
);

CREATE INDEX idx_oar_chip ON operator_accuracy_results(chip_id);
CREATE INDEX idx_oar_operator ON operator_accuracy_results(operator_name);
CREATE INDEX idx_oar_verdict ON operator_accuracy_results(verdict);
```

### 7.3 对比报告表

```sql
CREATE TABLE comparison_reports (
    id                  BIGSERIAL PRIMARY KEY,
    comparison_id       VARCHAR(64) NOT NULL UNIQUE,  -- 'cmp_20260408_001'
    comparison_type     VARCHAR(32) NOT NULL,          -- 'cross_chip', 'cross_precision', 'optimization'
    
    -- 基线与目标
    baseline_plan_id    BIGINT NOT NULL REFERENCES evaluation_plans(id),
    target_plan_id      BIGINT NOT NULL REFERENCES evaluation_plans(id),
    baseline_chip_id    BIGINT,
    target_chip_id      BIGINT,
    
    -- 对比维度
    dimensions          VARCHAR(64)[] DEFAULT '{performance}',  -- ['performance', 'accuracy']
    
    -- 对比结果（完整 JSON）
    report_data         JSONB NOT NULL,               -- 完整对比报告 JSON
    
    -- 汇总
    avg_latency_speedup     DOUBLE PRECISION,
    operators_compared      INT,
    
    -- 元数据
    created_by          BIGINT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT chk_different_plans CHECK (baseline_plan_id <> target_plan_id)
);

CREATE INDEX idx_cr_type ON comparison_reports(comparison_type);
CREATE INDEX idx_cr_baseline ON comparison_reports(baseline_plan_id);
CREATE INDEX idx_cr_target ON comparison_reports(target_plan_id);
```

---

## 八、API 设计

### 8.1 API 总览

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/operator-results` | 查询算子性能结果列表（支持筛选） | VIEWER |
| `GET` | `/api/operator-results/{id}` | 获取单条算子性能结果详情 | VIEWER |
| `GET` | `/api/plans/{planId}/operator-results` | 获取某 Plan 的全部算子性能结果 | VIEWER |
| `GET` | `/api/chips/{chipId}/operator-results` | 获取某芯片的全部算子性能结果 | VIEWER |
| `GET` | `/api/accuracy-results` | 查询精度验证结果列表 | VIEWER |
| `GET` | `/api/plans/{planId}/accuracy-results` | 获取某 Plan 的精度验证结果 | VIEWER |
| `GET` | `/api/accuracy-results/summary` | 精度验证汇总（通过率/失败项） | VIEWER |
| `POST` | `/api/reports/compare` | 创建对比报告 | ENGINEER |
| `GET` | `/api/reports/compare/{comparisonId}` | 获取对比报告 | VIEWER |
| `GET` | `/api/reports/compare` | 列表查询对比报告 | VIEWER |
| `POST` | `/api/reports/precision-tradeoff` | 精度-性能 tradeoff 分析 | ENGINEER |

### 8.2 算子性能结果查询 API

```
GET /api/operator-results?chip_id=42&operator=MatMul&dtype=FP32&size=Medium&page=0&size=20
Authorization: Bearer {token}

Response (200):
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": 1001,
        "operator_name": "MatMul",
        "category": "compute_intensive",
        "dtype": "FP32",
        "size_label": "Medium",
        "batch_size": 16,
        "latency_ms_p50": 2.289,
        "throughput_ops": 427.1,
        "gflops": 115.3,
        "compute_util_percent": 9.6,
        "memory_mb": 48.5,
        "chip_name": "Intel Xeon Gold 6248",
        "plan_id": 123,
        "created_at": "2026-04-08T10:30:00+08:00"
      }
    ],
    "total": 180,
    "page": 0,
    "size": 20
  }
}
```

### 8.3 精度验证汇总 API

```
GET /api/plans/{planId}/accuracy-results/summary
Authorization: Bearer {token}

Response (200):
{
  "code": 0,
  "data": {
    "plan_id": 123,
    "total_tests": 128,
    "pass": 125,
    "warning": 2,
    "fail": 1,
    "pass_rate": 97.66,
    "by_method": {
      "reference_comparison": {"total": 48, "pass": 47, "warning": 1, "fail": 0},
      "cross_precision": {"total": 48, "pass": 46, "warning": 1, "fail": 1},
      "math_property": {"total": 32, "pass": 32, "warning": 0, "fail": 0}
    },
    "by_dtype": {
      "FP32": {"total": 32, "pass": 32, "pass_rate": 100.0},
      "FP16": {"total": 32, "pass": 31, "pass_rate": 96.88},
      "BF16": {"total": 32, "pass": 31, "pass_rate": 96.88},
      "INT8": {"total": 32, "pass": 31, "pass_rate": 96.88}
    },
    "failures": [
      {
        "operator": "MatMul",
        "method": "cross_precision",
        "test_dtype": "INT8",
        "cosine_similarity": 0.9412,
        "threshold": 0.95,
        "verdict": "FAIL"
      }
    ]
  }
}
```

---

## 九、实施计划

### Phase 1（2 周）：精度验证框架 + 性能指标增强 + 评测脚本升级 + 模板更新

| 任务 | 优先级 | 工作量 | 产出 |
|------|--------|--------|------|
| Agent 端：精度验证框架（参考实现对比 + 精度指标计算） | P0 | 3d | 支持方法 1 参考对比、9 个精度指标、PASS/WARNING/FAIL 三级判定 |
| Agent 端：性能指标增强（GFLOPS、算力利用率、内存占用、延迟 CV） | P0 | 2d | 补齐性能指标到 14 项 |
| Agent 端：FP16 多精度支持（FP32 + FP16） | P0 | 1d | 支持 --dtype 参数，FP16 性能+精度测试 |
| Agent 端：补充 Phase 1 待实现算子（MaxPool, AvgPool, Dropout, Embedding） | P1 | 1d | 完成 14 个基础算子覆盖 |
| 后端：芯片注册增加 peak_gflops 字段 | P0 | 1d | chips 表新增 peak_gflops_fp32/fp16/bandwidth |
| 后端：评测结果精度指标存储 + 报告展示增强 | P0 | 2d | metrics_summary 包含精度指标，结果不再为空 {} |
| 模板：更新评测模板（精度验证 + 性能增强配置） | P0 | 1d | 3 个更新/新增模板 |

> **⚠️ Phase 1 不含对比 API 和前端对比展示，专注于精度验证基础和性能指标增强。**

### Phase 2（3 周）：对比 API + 前端对比展示 + BF16/INT8 + 新增算子

| 任务 | 优先级 | 工作量 | 产出 |
|------|--------|--------|------|
| 后端：对比报告 API（`POST /reports/compare`） | P0 | 2d | 跨芯片/跨精度/优化对比 |
| 前端：算子评测结果详情页（性能+精度双标签） | P0 | 3d | 表格 + 分布图 |
| 前端：对比报告页面（分组柱状图 + 详细表格） | P0 | 3d | ECharts 柱状图 + 涨跌表格 |
| 前端：精度热力图（算子 × 数据类型矩阵） | P1 | 2d | 红/黄/绿热力图 |
| 前端：雷达图（多维指标综合对比） | P1 | 1d | ECharts 雷达图 |
| Agent 端：BF16/INT8 多精度支持 | P1 | 2d | 需 ml_dtypes/PyTorch 依赖 |
| Agent 端：新增算子（RMSNorm, Conv3D, DepthwiseConv, MLP, FusedConvBNReLU） | P1 | 2d | 算子融合验证 |
| 后端：评测模板升级（JSON Schema + 全面评测模板） | P1 | 1d | 完整模板体系 |
| 后端：Precision-Tradeoff 分析 API | P2 | 1d | tradeoff 折线图数据源 |
| 后端：新增 `operator_perf_results` + `operator_accuracy_results` 结构化表 | P1 | 2d | 支持 SQL 查询和对比 |

### Phase 3（2 周）：GPU 算子适配 + 多芯片对比 + 通信算子

| 任务 | 优先级 | 工作量 | 产出 |
|------|--------|--------|------|
| Agent 端：GPU 算子评测（PyTorch CUDA 后端） | P0 | 3d | GPU 延迟/吞吐/显存/GFLOPS |
| Agent 端：GPU 精度验证（CUDA kernel vs CPU FP64 参考） | P0 | 2d | GPU 精度指标 |
| 后端：多芯片横向对比报告生成 | P1 | 2d | 支持 3+ 芯片同时对比 |
| 前端：多芯片对比大屏 | P2 | 3d | 综合对比看板 |
| Agent 端：通信算子评测（AllReduce 等，需多卡环境） | P2 | 3d | 通信带宽/延迟指标 |

### 里程碑

| 时间节点 | 里程碑 | 验收标准 |
|----------|--------|----------|
| Week 2 末 | Phase 1 完成 | 在 Intel CPU 上跑通标准评测模板（FP32+FP16），产出包含精度验证的完整结果 JSON，模板更新完成 |
| Week 5 末 | Phase 2 完成 | 对比 API 上线，前端可展示算子评测详情、精度热力图、跨芯片对比报告，BF16/INT8 支持 |
| Week 7 末 | Phase 3 完成 | GPU 评测跑通、多芯片对比报告、通信算子评测 |

---

## 附录 A：算子 FLOPs 计算公式

用于计算 `gflops` 和 `compute_util_percent` 指标。

| 算子 | FLOPs 公式 | 说明 |
|------|-----------|------|
| MatMul `[M,K] × [K,N]` | `2 × M × K × N` | 乘法 + 加法各 M×K×N 次 |
| BatchMatMul `[B,M,K] × [B,K,N]` | `2 × B × M × K × N` | 带 batch 维 |
| Conv2D `[B,Cin,H,W], kernel=[Cout,Cin,Kh,Kw]` | `2 × B × Cout × Hout × Wout × Cin × Kh × Kw` | 其中 `Hout = (H+2P-Kh)/S+1` |
| DepthwiseConv `[B,C,H,W], kernel=[C,1,Kh,Kw]` | `2 × B × C × Hout × Wout × Kh × Kw` | 每个通道独立卷积 |
| BatchNorm `[B,C,H,W]` | `≈ 5 × B × C × H × W` | mean + var + normalize + scale + shift |
| LayerNorm `[B,S,H]` | `≈ 5 × B × S × H` | 同 BN 公式 |
| RMSNorm `[B,S,H]` | `≈ 3 × B × S × H` | 无均值计算 |
| ReLU / Sigmoid / GELU / SiLU | `≈ k × numel` | k=1(ReLU), k=4(Sigmoid), k=8(GELU), k=5(SiLU) |
| Softmax `[B,S,S]` | `≈ 5 × B × S × S` | max + sub + exp + sum + div |
| MaxPool / AvgPool `[B,C,H,W]` | `B × C × Hout × Wout × Kh × Kw` | 每个窗口的比较/累加 |
| Attention `[B,H,S,D]` | `2×B×H×(2×S×S×D + S×S)` | QK^T + Softmax + AV |
| Embedding `[B,S]` → `[B,S,D]` | `0` (查表无浮点运算) | 内存操作，不计 FLOPs |

---

## 附录 B：参考资料

1. **DeepLink AIChipBenchmark** — 开源 AI 芯片评测基准
   - 评测方法论：分层评测（算子→模型→场景）
   - 精度验证标准：以 FP64 参考实现为 ground truth
   - 报告格式：算子性能表 + 精度通过率
   - https://github.com/DeepLink-org/AIChipBenchmark

2. **MLPerf Inference** — 国际 AI 推理性能基准
   - 评测指标：Latency（P99 / P90）、Throughput（samples/s）
   - 精度要求：与 FP32 baseline 对比，Top-1 偏差 ≤ 1%
   - 测试场景：Server / Offline / SingleStream / MultiStream
   - https://mlcommons.org/benchmarks/inference/

3. **ONNX Runtime Conformance Tests** — 算子正确性验证标准
   - 验证方法：以 ONNX 标准实现为参考，逐算子验证
   - 默认容差：`atol=1e-5, rtol=1e-4`（FP32）
   - 覆盖范围：200+ ONNX 标准算子
   - https://github.com/onnx/onnx/tree/main/onnx/backend/test

4. **IEEE 754 浮点标准** — ULP 误差的理论基础
   - FP32: 23bit 尾数 → ~7.2 位有效十进制数字
   - FP16: 10bit 尾数 → ~3.3 位有效十进制数字
   - BF16: 7bit 尾数 → ~2.4 位有效十进制数字

5. **Roofline Model** — 算力利用率评估框架
   - 横轴：Operational Intensity (FLOPs/Byte)
   - 纵轴：Attainable Performance (GFLOPS)
   - 判定：算子是计算 bound 还是内存 bound
   - https://en.wikipedia.org/wiki/Roofline_model

---

> **文档变更记录**
>
> | 版本 | 日期 | 变更内容 | 作者 |
> |------|------|----------|------|
> | v1.0 | 2026-04-08 | 初稿，覆盖性能评测 + 精度评测 + 对比设计 + API + 数据模型 | AHVP 产品团队 |
> | v1.1 | 2026-04-08 | 评审修订：标注算子实现状态、明确多精度分期约束（Phase 1 仅 FP32+FP16）、peak_gflops 动态获取（不硬编码）、对比功能整体推 Phase 2、精度阈值标注初始推荐值 + 校准机制 | AHVP 产品团队 |
