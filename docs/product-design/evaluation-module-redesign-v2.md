# AHVP 评测模块产品设计文档 v2.0

> **文档版本:** v2.0
> **创建日期:** 2026-04-04
> **状态:** 详细设计稿
> **目标读者:** 产品负责人、前后端开发、测试团队
> **基于:** 客户原始 PRD 五大模块需求 + v1 设计反馈 + DeepLink/FlagPerf/MLPerf 对标研究

---

## 第一部分：产品定位与目标

### 1.1 一句话定义

**AHVP 是一个以芯片档案为中心、以评测模板为驱动的 AI 硬件全栈验证平台，通过标准化的六层评测体系（芯片→算子→中间层→框架→模型→场景），生成可量化、可对比的芯片能力评价报告，服务于国产芯片厂商研发验证、算力采购选型和行业生态适配。**

### 1.2 五大模块需求映射

| 原始模块 | v2 设计映射 | 处理方式 |
|---------|-----------|---------|
| 评测任务管理 | 第二部分：评测任务全流程设计 | **重点强化**，补完整任务状态机、调度、监控 |
| 评测模板管理 | 第三部分：模板管理模块 | **全新设计**，含 JSON Schema、预置模板、版本管理 |
| 评测报告与对比 | 第五部分：报告页面设计 | 报告绑定到芯片档案，不再独立存在 |
| 芯片档案管理 | 贯穿全文，以芯片为核心 | 延续 v1 的芯片中心理念 |
| 计算资源与节点 | 第二部分 2.5 资源分配策略 | 简化为节点管理+资源池 |

### 1.3 与竞品的差异化

| 竞品 | 强项 | 弱项 | AHVP 差异 |
|------|------|------|----------|
| DeepLink AIChipBenchmark | 评测标准权威（季度评测、300+算子） | 无 Web 界面，依赖 Excel/PDF | Web 可视化 + 自动化编排 |
| FlagPerf | 多芯片多框架覆盖（30+模型） | 纯命令行，结果在 GitHub 表格 | 分步引导式 UI + 实时监控 |
| MLPerf | 国际黄金标准 | 参与门槛极高，周期长 | 低门槛、按需评测、快速迭代 |
| 阿里云 CNP | Web UI + 分步引导 | 绑定灵骏，不跨平台 | 跨平台、多硬件、芯片档案制 |
| Azure AI Foundry | UI 最成熟（Index Score+散点图） | 偏模型评测，非硬件 | 以芯片为中心 + 模板驱动 |

### 1.4 六层评测体系

对齐 DeepLink 评测维度，AHVP 定义六层评测层级：

```
Layer 6: 场景评测 (Scenario)     — 端到端业务场景验证
Layer 5: 模型评测 (Model)        — 完整模型训练/推理性能与精度
Layer 4: 框架评测 (Framework)    — 框架兼容性、算子覆盖率
Layer 3: 中间层评测 (Middleware)  — 编译器优化、算子融合
Layer 2: 算子评测 (Operator)     — 单算子精度验证 + 性能 benchmark
Layer 1: 芯片评测 (Chip)         — 裸机算力、内存带宽、通信、功耗
```

---

## 第二部分：评测任务全流程设计

### 2.1 任务状态机

```
                              用户提交
                                │
                                ▼
┌──────────┐   验证通过   ┌──────────┐   调度器分配   ┌──────────┐
│  DRAFT   │────────────▶│ PENDING  │──────────────▶│ QUEUED   │
│  (草稿)   │             │ (待审核)  │               │ (排队中)  │
└──────────┘             └──────────┘               └────┬─────┘
     │                        │                          │
     │ 用户删除                │ 验证失败                  │ Agent 拉取
     ▼                        ▼                          ▼
┌──────────┐           ┌──────────┐              ┌──────────┐
│ DELETED  │           │ REJECTED │              │ RUNNING  │
└──────────┘           └──────────┘              └────┬─────┘
                                                      │
                                  ┌───────────────────┼───────────────────┐
                                  │                   │                   │
                                  ▼                   ▼                   ▼
                           ┌──────────┐        ┌──────────┐       ┌──────────┐
                           │COMPLETED │        │ FAILED   │       │ TIMEOUT  │
                           │ (已完成)  │        │ (已失败)  │       │ (已超时)  │
                           └──────────┘        └────┬─────┘       └────┬─────┘
                                │                   │                   │
                                │                   ▼                   ▼
                                │              ┌──────────┐      ┌──────────┐
                                │              │ RETRYING │      │ RETRYING │
                                │              └──────────┘      └──────────┘
                                │                   │                   │
                                │                   └─────┬─────────────┘
                                ▼                         ▼
                         ┌─────────────┐          (回到 QUEUED)
                         │ REPORT_READY│
                         └─────────────┘

特殊状态: RUNNING→CANCELLED, QUEUED→CANCELLED, RUNNING→PAUSED→QUEUED
```

**状态定义详表：**

| 状态 | 编码 | 说明 | 后续状态 | 触发条件 |
|------|------|------|---------|---------|
| DRAFT | 0 | 已创建未提交 | PENDING, DELETED | 用户保存草稿 |
| PENDING | 1 | 已提交待验证 | QUEUED, REJECTED | 用户点击"提交" |
| REJECTED | 2 | 验证失败 | DRAFT | 系统校验失败 |
| QUEUED | 10 | 已入队等待 | RUNNING, CANCELLED | 调度器入队 |
| RUNNING | 20 | 执行中 | COMPLETED, FAILED, TIMEOUT, CANCELLED, PAUSED | Agent 开始执行 |
| PAUSED | 21 | 用户暂停 | QUEUED | 用户手动暂停 |
| COMPLETED | 30 | 成功 | REPORT_READY | Agent 返回成功 |
| FAILED | 40 | 失败 | RETRYING, CANCELLED | Agent 返回错误 |
| TIMEOUT | 41 | 超时 | RETRYING, CANCELLED | 超过 timeout_seconds |
| RETRYING | 42 | 重试中 | QUEUED | 用户/系统触发重试 |
| CANCELLED | 50 | 已取消 | （终态） | 用户取消 |
| DELETED | 99 | 已删除 | （终态） | 用户删除草稿 |
| REPORT_READY | 60 | 报告就绪 | （终态） | 报告生成完成 |

### 2.2 任务创建流程（6步向导，交互细节）

#### Step 1: 选择目标芯片
- Radio 单选列表，每项: [芯片名称] [厂商] [类型] [评测状态]
- 必须选择一颗芯片才能进入下一步
- 已有评测中的芯片标记"⚠️ 评测中"但不禁止选择

#### Step 2: 选择评测模板
- 推荐模板区: 3-5 张卡片（[模板名称] [评测层级] [评测项数量] [预估耗时] [描述]）
- 我的模板区: 自定义模板列表
- [从零开始 →]: 跳到空白 Step 3
- 选择模板后自动填充 Step 3/4 参数

#### Step 3: 选择评测项
- 左侧: 三级选择树（评测层级→测试类型→具体算子/模型）
  - 算子评测 (Layer 2): 精度测试（22 类 414+ 算子）、性能测试（GEMM/Conv2d/长尾/通信）
  - 模型评测 (Layer 5): 基础模型（9分类+10检测+5分割）、大模型（推理/训练/微调）
  - 芯片评测 (Layer 1): 算力/内存/通信/功耗
- 右侧: 实时已选摘要（评测项数、预计任务数）
- 分类节点支持"全选/全不选"复选框

#### Step 4: 配置评测参数

**4.1 全局参数：**

| 参数 | 控件 | 默认值 | 范围 | 说明 |
|------|------|--------|------|------|
| 计划名称 | 文本 | "{芯片名} {模板名} {日期}" | 1-200字符 | 自动生成 |
| 最大并发任务数 | 数字 | 4 | 1-32 | 同时执行最大任务数 |
| 全局超时 | 数字 | 86400 | 3600-604800 | 秒 |
| 失败重试次数 | 数字 | 2 | 0-5 | 单任务自动重试 |

**4.2 算子精度测试参数（对齐 DeepLink）：**

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| 数据类型 | [FP32, FP16] | FP32/FP16/BF16/INT8 | 每种独立测试 |
| FP32 绝对误差阈值 | 1e-5 | 1e-8~1e-2 | 对齐 DeepLink abs_thresh |
| FP32 相对误差阈值 | 1e-4 | 1e-6~1e-2 | 对齐 DeepLink relative_thresh |
| FP16 绝对误差阈值 | 1e-3 | 1e-6~1e-1 | 半精度容忍度更高 |
| FP16 相对误差阈值 | 1e-3 | 1e-6~1e-1 | |
| 容忍率 | 0.001 | 0~0.01 | 超阈值元素比例上限 |
| 测试梯度 | 开 | 开/关 | 反向梯度精度 |
| 基准值来源 | "NVIDIA A100" | A100/H100/自定义 | |

**4.3 算子性能测试参数：**

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| 输入规模预设 | Medium | Small/Medium/Large/Custom | 控制 shape 参数集 |
| 数据类型 | [FP16, FP32] | FP16/FP32/BF16/INT8 | |
| Warmup 次数 | 10 | 1-100 | 预热迭代数 |
| 测试迭代次数 | 100 | 10-10000 | |
| 单任务超时 | 300秒 | 30-3600 | |
| 性能评分方式 | 基准比值 | 基准比值/绝对值 | score=baseline_time/test_time |

**GEMM Medium 预设（对齐 DeepLink gemm_f16.csv）：**
m=256,k=256,n=256 / m=512,k=512,n=512 / m=1024,k=1024,n=1024 / m=2048,k=2048,n=2048 / m=4096,k=4096,n=4096 / m=1024,k=256,n=1024 / m=4096,k=1024,n=4096 / m=8192,k=1024,n=8192

**4.4 模型评测参数：**

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| Batch Size | [1,4,8,16] | 1-512 | 每个 batch 独立测试 |
| 推理测试迭代 | 50 | 10-1000 | |
| 推理框架 | 自动检测 | NumPy/PyTorch/ONNX Runtime/TensorRT | |
| 训练 Epoch | 5 | 1-100 | |
| 收敛阈值 | 0.99 | 0.9-1.0 | loss cosine similarity |
| 单任务超时 | 600秒 | 60-86400 | |

**4.5 大模型评测参数（对齐 MLPerf）：**

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| 序列长度 | 1024 | 128-8192 | tokens |
| 输出长度 | 256 | 32-4096 | tokens |
| 并发请求数 | [1,4,8] | 1-128 | |
| 推理场景 | [Server] | Offline/Server/SingleStream | 对齐 MLPerf |
| TTFT SLA | 2000ms | 100-30000 | 对齐 MLPerf LLAMA2-70B |
| TPOT SLA | 200ms | 10-5000 | |
| 精度指标 | [Rouge1,Rouge2,RougeL] | Rouge/BLEU/Accuracy/F1 | |

**4.6 芯片评测参数：**

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| 算力测试精度 | [FP16,FP32] | FP16/FP32/BF16/INT8/FP64 | |
| 内存测试工具 | STREAM | STREAM/自定义 | |
| 通信测试工具 | NCCL-tests | NCCL-tests/OSU Benchmarks | |
| 功耗采集间隔 | 1000ms | 100-10000 | |
| 压力测试时长 | 600秒 | 60-86400 | |

#### Step 5: 选择计算节点
- 节点卡片: [名称] [状态灯] [硬件摘要] [负载] [队列深度]
- 离线节点灰色不可选
- 支持多节点选择（分布式场景）

#### Step 6: 确认并提交
- 计划摘要（全部参数汇总）
- 预估: 任务总数、总耗时、资源消耗
- ☐ 提交后立即执行（默认勾选）
- ☐ 保存为新模板（可选）

### 2.3 任务拆分算法

```
计划提交后自动拆分:
- 算子精度: 每个算子 × 每种数据类型 = 1 个任务
- 算子性能: 每个类型 × 每种dtype × 每组shape = 1 个任务
- 模型评测: 每个模型 × 每个batch_size × 每种模式 = 1 个任务
- 芯片评测: 每个测试项 = 1 个任务

优先级排序:
  精度测试(10) > 芯片评测(20) > 性能测试(30) > 模型评测(40)
  
依赖规则: 精度FAIL的算子→性能测试自动SKIP
```

### 2.4 任务调度算法

```
每 5 秒一次调度循环:
1. 扫描所有 QUEUED 任务
2. 按优先级排序 (priority ASC, created_at ASC)
3. 检查: 计划并发数 < max_concurrent? 节点在线且空闲? 依赖已完成?
4. 满足条件: RUNNING + WebSocket 推送给 Agent + 启动超时计时器
5. 检查 RUNNING 任务: 超时→TIMEOUT, 心跳超时(60s)→FAILED
6. 计划完成检查: 全部终态→触发报告生成; FAILED+重试未用完→自动重试
```

### 2.5 资源分配策略

| 策略 | 描述 | 场景 |
|------|------|------|
| 独占模式 | 任务独占节点 | 算力测试、功耗测试 |
| 共享模式 | 多任务并行 | 算子精度测试 |
| GPU 独占 | 任务独占一块 GPU | GPU 性能测试 |
| 多 GPU | 使用多块 GPU | 分布式训练 |
| 多节点 | 跨多个节点 | 多机通信测试 |

### 2.6 执行监控

- Agent→Server: 每 5 秒 WebSocket 上报进度
- Server→前端: SSE 推送
- 日志流: 实时 stdout/stderr

**监控页面层级:**
- 总体进度条 + 状态分布 + 资源使用概览
- 任务分组（按测试类型折叠）: 每个任务显示状态/指标/耗时
- 失败任务区: [重试] [日志] [跳过] 按钮
- 底部实时日志流

### 2.7 结果收集与存储

**算子精度结果:** forward/backward max_abs_error, max_rel_error, fail_ratio, PASS/FAIL

**算子性能结果:** latency_mean/p50/p95/p99/min/max, throughput, tflops, score

**模型评测结果:** latency, throughput_qps, memory_peak, accuracy, accuracy_pass

### 2.8 异常处理

| 异常 | 检测 | 自动处理 | 用户操作 |
|------|------|---------|---------|
| 任务超时 | 计时器 | TIMEOUT + 自动重试 | [重试] [跳过] |
| Agent 离线 | 心跳超时(60s) | FAILED | [等待] [迁移节点] |
| OOM | MemoryError | FAILED | [调参重试] |
| NaN/Inf | 结果校验 | FAILED | [重试] [查日志] |
| 精度不达标 | 阈值比较 | FAIL + 跳过性能测试 | [放宽阈值] |
| 资源不足 | 节点检查 | 保持 QUEUED | [换节点] |

**重试策略:** 最大重试 2 次，指数退避（立即→30s→120s），重试创建新 task record 关联 retry_of

### 2.9 报告生成触发条件

```
所有任务达终态后:
  完成率 >= 80%: 生成完整报告
  完成率 >= 50%: 生成部分报告 + 警告
  完成率 < 50%: 不自动生成，提示重试

生成流程: 聚合结果→计算评分→雷达图→瓶颈分析→场景推荐→创建ChipReport→更新芯片画像→通知用户
```

---

## 第三部分：模板管理模块

### 3.1 模板分类体系

```
├── L1: 芯片评测模板 (基础规格/算力全面/稳定性压力)
├── L2: 算子评测模板 (DeepLink精度全量/核心性能/大模型算子/长尾)
├── L3: 中间层评测模板 (编译器优化/算子融合)
├── L4: 框架评测模板 (PyTorch覆盖率/兼容性)
├── L5: 模型评测模板 (DeepLink基础24模型/大模型推理/大模型训练/MLPerf对标)
├── L6: 场景评测模板 (推理服务/训练流水线)
└── 综合模板 (快速冒烟15分钟/标准评测4小时/全量评测8小时)
```

### 3.2 模板 JSON Schema 定义

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://ahvp.sensecore.cn/schemas/evaluation-template-v2.json",
  "title": "EvaluationTemplate",
  "type": "object",
  "required": ["template_id", "name", "version", "evaluation_layer", "test_items", "parameters"],
  "properties": {
    "template_id": {"type": "string", "pattern": "^tpl-[a-z0-9]{8}$"},
    "name": {"type": "string", "minLength": 1, "maxLength": 200},
    "description": {"type": "string", "maxLength": 2000},
    "version": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
    "evaluation_layer": {"type": "string", "enum": ["chip","operator","middleware","framework","model","scenario","comprehensive"]},
    "tags": {"type": "array", "items": {"type": "string"}},
    "is_preset": {"type": "boolean", "default": false},
    "estimated_duration_minutes": {"type": "integer", "minimum": 1},
    "test_items": {
      "type": "object",
      "properties": {
        "operator_accuracy": {
          "type": "object",
          "properties": {
            "enabled": {"type": "boolean"},
            "operators": {"type": "array", "items": {
              "type": "object",
              "required": ["name", "category"],
              "properties": {
                "name": {"type": "string"},
                "category": {"type": "string", "enum": ["BLAS","Convolution","Norm","Activation","Pooling","Loss","Element-wise","Reduce","Permute","View_Copy","Advanced_Indexing","Distribution","Sort","Interpolate","Communication","Dropout","Optimizer","Broadcast","Composite","Pad","MISC"]},
                "enabled": {"type": "boolean", "default": true}
              }
            }}
          }
        },
        "operator_performance": {
          "type": "object",
          "properties": {
            "enabled": {"type": "boolean"},
            "tests": {"type": "array", "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string", "enum": ["gemm_f16","gemm_f32","conv_f16","conv_f32","longtail","communication"]},
                "enabled": {"type": "boolean"}
              }
            }}
          }
        },
        "model_evaluation": {
          "type": "object",
          "properties": {
            "enabled": {"type": "boolean"},
            "models": {"type": "array", "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string"},
                "category": {"type": "string", "enum": ["classification","detection","segmentation","llm_inference","llm_training","llm_finetuning"]},
                "modes": {"type": "array", "items": {"type": "string", "enum": ["inference","training","finetuning"]}}
              }
            }}
          }
        },
        "chip_benchmark": {
          "type": "object",
          "properties": {
            "enabled": {"type": "boolean"},
            "tests": {"type": "array", "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string", "enum": ["compute_power","memory_bandwidth","communication_bandwidth","power_consumption","stability"]},
                "enabled": {"type": "boolean"}
              }
            }}
          }
        }
      }
    },
    "parameters": {
      "type": "object",
      "properties": {
        "global": {"type": "object", "properties": {
          "max_concurrent_tasks": {"type": "integer", "default": 4, "minimum": 1, "maximum": 32},
          "global_timeout_seconds": {"type": "integer", "default": 86400},
          "max_retries": {"type": "integer", "default": 2, "minimum": 0, "maximum": 5}
        }},
        "operator_accuracy": {"type": "object", "properties": {
          "data_types": {"type": "array", "items": {"type": "string"}, "default": ["FP32","FP16"]},
          "fp32_abs_threshold": {"type": "number", "default": 1e-5},
          "fp32_rel_threshold": {"type": "number", "default": 1e-4},
          "fp16_abs_threshold": {"type": "number", "default": 1e-3},
          "fp16_rel_threshold": {"type": "number", "default": 1e-3},
          "tolerance_ratio": {"type": "number", "default": 0.001},
          "test_backward": {"type": "boolean", "default": true},
          "baseline_chip": {"type": "string", "default": "NVIDIA_A100"}
        }},
        "operator_performance": {"type": "object", "properties": {
          "shape_preset": {"type": "string", "enum": ["Small","Medium","Large","Custom"], "default": "Medium"},
          "data_types": {"type": "array", "default": ["FP16","FP32"]},
          "warmup_iterations": {"type": "integer", "default": 10},
          "test_iterations": {"type": "integer", "default": 100},
          "task_timeout_seconds": {"type": "integer", "default": 300},
          "scoring_method": {"type": "string", "default": "baseline_ratio"},
          "baseline_chip": {"type": "string", "default": "NVIDIA_A100"}
        }},
        "model_evaluation": {"type": "object", "properties": {
          "batch_sizes": {"type": "array", "default": [1,4,8,16]},
          "inference_iterations": {"type": "integer", "default": 50},
          "inference_framework": {"type": "string", "default": "auto"},
          "training_epochs": {"type": "integer", "default": 5},
          "convergence_threshold": {"type": "number", "default": 0.99},
          "task_timeout_seconds": {"type": "integer", "default": 600}
        }},
        "llm_evaluation": {"type": "object", "properties": {
          "max_seq_len": {"type": "integer", "default": 1024},
          "max_output_len": {"type": "integer", "default": 256},
          "concurrent_requests": {"type": "array", "default": [1,4,8]},
          "scenarios": {"type": "array", "default": ["Server"]},
          "ttft_sla_ms": {"type": "integer", "default": 2000},
          "tpot_sla_ms": {"type": "integer", "default": 200}
        }},
        "chip_benchmark": {"type": "object", "properties": {
          "compute_precisions": {"type": "array", "default": ["FP16","FP32"]},
          "compute_method": {"type": "string", "default": "GEMM"},
          "memory_tool": {"type": "string", "default": "STREAM"},
          "communication_tool": {"type": "string", "default": "NCCL-tests"},
          "stability_duration_seconds": {"type": "integer", "default": 600}
        }}
      }
    }
  }
}
```

### 3.3 预置模板示例

#### 示例 1: 快速冒烟验证（15分钟）
- 10 个核心算子精度测试（matmul, conv2d, batch_norm, layer_norm, relu, gelu, softmax, sigmoid, add, mul）
- GEMM 性能测试（Small preset, FP32）
- MLP-Medium 推理（batch=1,4）
- 参数: FP32 only, 无梯度测试, warmup=5, iterations=50

#### 示例 2: DeepLink 标准评测（4小时）
- 50+ 算子精度测试（FP32+FP16, 含梯度）
- GEMM+Conv2d+长尾+通信 性能测试（Medium preset）
- 24 个基础模型（9分类+10检测+5分割）训练+推理
- 芯片规格: 算力+内存+通信
- 参数: 对齐 DeepLink 全部阈值, baseline=A100

#### 示例 3: 大模型推理性能评测（2小时）
- LLaMA2-7B/70B, GPT-J-6B, Mixtral-8x7B 推理
- Server + Offline 两种场景
- 并发: 1,4,8,16,32
- TTFT SLA=2000ms, TPOT SLA=200ms
- 精度: Rouge1/Rouge2/RougeL, baseline 99%

### 3.4 模板 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/templates | 列表（分页、筛选 layer/tags/is_preset） |
| GET | /api/v1/templates/{id} | 详情 |
| POST | /api/v1/templates | 创建 |
| PUT | /api/v1/templates/{id} | 更新（新版本） |
| DELETE | /api/v1/templates/{id} | 删除（预置不可删） |
| POST | /api/v1/templates/{id}/fork | Fork |
| GET | /api/v1/templates/{id}/versions | 版本历史 |
| POST | /api/v1/templates/validate | JSON 校验 |
| POST | /api/v1/templates/import | 导入 |
| GET | /api/v1/templates/{id}/export | 导出 |

### 3.5 模板版本管理
- 语义化版本号 MAJOR.MINOR.PATCH
- 版本不可变，修改创建新版本
- 计划关联模板具体版本（template_id + version）
- 预置模板由管理员更新，用户只能 Fork

### 3.6 模板与任务关联
- 创建计划时选模板→预填充参数→用户可覆盖
- 提交时记录: template_id, template_version, plan_config(实际配置), config_diff(差异)
- 可选"保存为新模板"

---

## 第四部分：评测参数设计（对齐 DeepLink）

### 4.1 算子精度测试参数（对齐 DeepLink accuracy_test）

| 参数名 | 类型 | 默认值 | 取值范围 | 单位 | 说明 |
|--------|------|--------|---------|------|------|
| operator_name | string | - | op_config.py 算子名 | - | 评测算子 |
| operator_category | string | - | 22类 | - | DeepLink 分类 |
| data_type | enum | FP32 | FP32/FP16/BF16/INT8 | - | |
| fp32_abs_threshold | float | 1e-5 | [1e-8, 1e-2] | - | |
| fp32_rel_threshold | float | 1e-4 | [1e-6, 1e-2] | - | |
| fp16_abs_threshold | float | 1e-3 | [1e-6, 1e-1] | - | |
| fp16_rel_threshold | float | 1e-3 | [1e-6, 1e-1] | - | |
| bf16_abs_threshold | float | 1e-2 | [1e-4, 1e-1] | - | |
| bf16_rel_threshold | float | 1e-2 | [1e-4, 1e-1] | - | |
| total_threshold | float | 0.001 | [0, 0.01] | - | 容忍率 |
| test_forward | bool | true | | - | |
| test_backward | bool | true | | - | |
| test_module_grad | bool | true | | - | |
| baseline_source | string | NVIDIA_A100 | A100/H100/自定义 | - | |

**判定公式:** `|chip_output - baseline| <= abs_thresh + rel_thresh * |baseline|`, 失败率 < total_threshold

### 4.2 算子性能测试参数（对齐 DeepLink speed_test）

**GEMM:** m,k,n (int, 64-16384), trans_a/b (bool), data_type, warmup (10), iterations (100)

**Conv2d:** n,c,h,w,c_out,k_h,k_w,pad,stride,data_type (对齐 DeepLink conv_f16.csv)

**通信:** operation (AllReduce等), message_sizes, num_gpus (2-128), topology, backend (NCCL/HCCL)

### 4.3 模型评测参数

**推理:** model_name, batch_size(1-512), framework(auto/numpy/pytorch/onnx/tensorrt), warmup(10), iterations(50), timeout(600s)

**输出指标:** latency_mean/p50/p95/p99, throughput_samples_per_sec, memory_peak_mb, accuracy

**训练:** epochs(5), batch_size(32), learning_rate(0.01), optimizer(SGD), num_gpus(1-128), parallel_strategy

**输出指标:** training_throughput, time_to_accuracy, convergence_accuracy, loss_cosine_similarity, scaling_efficiency

### 4.4 芯片评测参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| compute_precision | FP16 | FP64/FP32/TF32/FP16/BF16/INT8 |
| compute_method | GEMM | |
| memory_test_tool | STREAM | |
| power_sample_interval | 1000ms | |
| stability_duration | 600s | |

**输出指标:** tflops_fp16/fp32/bf16, tops_int8, memory_bandwidth(TB/s), allreduce_bandwidth(GB/s), power_mean/peak(W), energy_efficiency(TFLOPS/W)

### 4.5 框架评测参数

framework, framework_version, adapter_layer(DIPU), operator_coverage_test, model_coverage_test, compiled_mode_test

**输出:** operator_coverage_rate(%), operator_fallback_count, model_pass_rate(%), compile_speedup_ratio

### 4.6 中间层评测参数

compiler(TorchDynamo/XLA/AscendCL), optimization_level(O2), fusion_patterns, test_models

**输出:** compilation_time(s), eager_vs_compiled_speedup, fusion_success_rate(%), graph_break_count

### 4.7 场景评测参数

scenario_type(inference_service/training_pipeline), qps_target(100), sla_latency_p99(100ms), duration_minutes(30), concurrent_users([1,10,50,100])

**输出:** max_qps_within_sla, latency_p99_at_target_qps, error_rate(%), availability(%)

---

## 第五部分：核心页面设计

### 5.1 模板管理页面

- 顶部: [创建模板] [导入] 按钮 + 筛选栏（层级/标签/预置or自定义）+ 搜索
- 系统预置区: 卡片网格（每行3张），每张卡片含 模板名/层级/耗时/评测项数/[使用][预览][Fork]
- 我的模板区: 同上 + [编辑][删除][导出]

### 5.2 任务创建向导

顶部6步进度条: 选芯片→选模板→选评测项→配参数→选节点→确认提交

### 5.3 任务监控页

- 总体进度条 + 状态分布(✅/🔄/⏳/❌)
- 任务分组列表(可折叠): 每个任务 状态图标+名称+关键指标+耗时
- 实时日志流(支持搜索/级别过滤/自动滚动)
- 资源仪表盘(CPU/GPU/内存实时折线图)
- 浮窗快捷操作: [暂停全部] [取消全部] [重试失败]
- 三种视图: 列表/分组/甘特图

### 5.4 报告页面

```
报告头: 芯片|模板|日期|状态|[下载PDF][导出Excel]
1. 能力总览: 综合评分(0-100) + 六维雷达图(算力/访存/通信/算子/模型/生态) + 能力摘要
2. 算子精度结果: 通过率统计 + 算子精度表(名/分类/FP32/FP16/误差/判定) + 失败详情
3. 算子性能结果: 延迟柱状图(Mean+P95) + 性能排行表(名/Mean/P95/吞吐/Score/状态) + 基准对比
4. 模型评测结果: 模型性能表(名/Batch/延迟/吞吐/精度/内存) + 吞吐vs Batch折线图
5. 芯片规格结果: 实测值vs标称值表
6. 瓶颈分析: TOP3瓶颈算子(原因+建议) + 性能波动分析(P99/P50排行)
7. 评测环境: 节点配置/软件版本/模板版本/参数快照
```

---

## 第六部分：数据模型设计

### 6.1 核心实体

#### Chip（芯片）
- id: UUID (PK)
- chip_no: VARCHAR(30) UNIQUE -- CHIP-YYYYMMDD-NNN
- name, vendor: VARCHAR(200) NOT NULL
- chip_type: ENUM(GPU/NPU/TPU/CPU/OTHER)
- specs: JSONB -- {fp16_tflops, fp32_tflops, memory_gb, tdp_watts, ...}
- software_env: JSONB -- {driver, sdk, frameworks}
- status: ENUM(REGISTERED/EVALUATING/EVALUATED)
- profile_data: JSONB -- {dimensions, overall_score}
- tags, created_by, timestamps

#### EvaluationTemplate（评测模板）
- id: UUID (PK)
- template_id: VARCHAR(20) UNIQUE -- tpl-xxxxxxxx
- name, description, version, evaluation_layer, tags, is_preset
- estimated_duration_minutes
- config: JSONB NOT NULL -- 完整模板配置
- forked_from: UUID nullable, usage_count
- UNIQUE(template_id, version)

#### EvaluationPlan（评测计划）
- id: UUID (PK)
- plan_no: VARCHAR(30) UNIQUE -- PLAN-YYYYMMDD-NNN
- name, description
- chip_id: UUID NOT NULL (FK→Chip)
- template_id, template_version: 引用模板
- plan_config: JSONB NOT NULL -- 实际配置
- config_diff: JSONB -- 与模板差异
- status: ENUM(DRAFT/PENDING/QUEUED/RUNNING/PAUSED/COMPLETED/FAILED/CANCELLED/REPORT_READY)
- node_ids, progress_percent, total/completed/failed_tasks
- timestamps

#### EvaluationTask（评测任务）
- id: UUID (PK)
- task_no: VARCHAR(30) UNIQUE -- TASK-YYYYMMDD-NNNNNN
- plan_id: UUID NOT NULL (FK→Plan)
- chip_id: UUID NOT NULL (FK→Chip) -- 冗余
- test_subject: ENUM(OPERATOR_ACCURACY/OPERATOR_PERFORMANCE/MODEL_EVALUATION/CHIP_BENCHMARK/FRAMEWORK_TEST/MIDDLEWARE_TEST/SCENARIO_TEST)
- test_item: VARCHAR(200) NOT NULL
- test_config: JSONB NOT NULL
- status: ENUM(PENDING/QUEUED/RUNNING/COMPLETED/FAILED/TIMEOUT/RETRYING/CANCELLED/SKIPPED)
- priority: SMALLINT (0-99)
- retry_count, max_retries, retry_of
- node_id, agent_id, timeout_seconds
- error_message, log_path, timestamps

#### EvaluationResult（评测结果）
- id: UUID (PK)
- task_id, plan_id, chip_id: UUID NOT NULL (含冗余)
- result_type, status: ENUM(PASS/FAIL/WARNING/ERROR)
- result_data: JSONB NOT NULL
- metrics_summary: JSONB
- score: DECIMAL(5,2)
- baseline_data, environment: JSONB
- timestamps

#### ChipReport（芯片评价报告）
- id: UUID (PK)
- report_no: VARCHAR(30) UNIQUE -- RPT-YYYYMMDD-NNN
- chip_id, plan_id, template_id: UUID
- overall_score: DECIMAL(5,2)
- dimension_scores: JSONB -- {compute,memory,communication,operator,model,ecosystem}
- radar_data, accuracy_summary, performance_summary: JSONB
- bottleneck_analysis, recommendations: JSONB
- completion_rate: DECIMAL(5,2)
- report_data: JSONB
- status: ENUM(GENERATING/DRAFT/PUBLISHED/ARCHIVED)
- timestamps

### 6.2 实体关系

```
Chip (1) ──▶ (N) EvaluationPlan (1) ──▶ (N) EvaluationTask (1) ──▶ (1) EvaluationResult
  │                    │
  │ (1:N)              │ (N:1)
  ▼                    ▼
ChipReport       EvaluationTemplate (被引用)

关键约束:
- Plan 必须属于 Chip
- Task 必须属于 Plan
- Result 必须属于 Task
- Report 绑定 Chip + Plan
- chip_id 在 Task/Result 冗余存储（加速查询）
```

---

## 第七部分：MVP 拆分建议

### Phase 1: MVP（4-6 周）

| 功能 | P | 估时 |
|------|---|------|
| 芯片 CRUD | P0 | 3d |
| 模板管理(预置+查看) | P0 | 3d |
| 创建向导(6步) | P0 | 5d |
| 任务拆分 | P0 | 3d |
| 调度执行 | P0 | 3d |
| 执行监控 | P0 | 3d |
| 结果收集 | P0 | 2d |
| 评分算法 | P0 | 3d |
| 报告生成 | P0 | 5d |
| 雷达图 | P0 | 2d |
| Dashboard | P1 | 3d |
| PDF下载 | P1 | 2d |
| 模板Fork | P1 | 2d |

**验收:** 注册芯片→选模板→执行→报告，CPU 下端到端跑通

### Phase 2: 增强（6-8 周）
模板版本+导入导出, 芯片对比, DeepLink数据表导出, 100+算子, 24模型, 通信测试, 报告自定义

### Phase 3: GPU/分布式（8-12 周）
GPU评测(CUDA/DIPU), 国产芯片适配, 大模型评测, 多节点, 框架评测, 中间层评测, 场景评测

---

## 附录 A：DeepLink 算子分类映射（22类 414+算子）

| 分类 | 数量 | 典型算子 |
|------|------|---------|
| Convolution | 9 | conv2d, ConvTranspose2d |
| Pooling | 23 | max_pool, adaptive_avg_pool |
| Pad | 2 | pad |
| Loss | 18 | cross_entropy, mse_loss |
| Norm | 12 | batch_norm, layer_norm |
| Activation | 20 | relu, gelu, softmax |
| Dropout | 10 | dropout |
| Optimizer | 17 | sgd, adam |
| Communication | 15 | all_reduce, all_gather |
| Interpolate | 4 | grid_sample |
| BLAS | 18 | mm, bmm, matmul, linear |
| Linalg | 34 | svd, det, inverse |
| Permute | 13 | concat, transpose |
| View/Copy | 18 | reshape, squeeze |
| Advanced Indexing | 14 | index_select, masked_fill |
| Distribution | 23 | normal, uniform |
| Sort | 5 | topk, sort |
| Element-wise | 109 | add, mul, exp, log |
| Broadcast | 18 | repeat, expand |
| Reduce | 15 | sum, mean, max |
| Composite | 7 | addcmul |
| MISC | 10 | nonzero, unique |

## 附录 B：MLPerf Inference v5.0 对标

| 任务 | 模型 | 数据集 | 参考精度 | Server延迟 |
|------|------|--------|---------|-----------|
| 分类 | ResNet50 | ImageNet | 76.46% ACC | 15ms |
| 检测 | RetinaNet | OpenImages | 0.3755 mAP | 100ms |
| 医学分割 | 3D-UNet | KiTS2019 | 0.8633 DICE | N/A |
| QA | BERT-Large | SQuAD v1.1 | 90.874% F1 | 130ms |
| 摘要 | GPT-J 6B | CNN DailyMail | Rouge1=42.99 | 20s |
| 混合 | Mixtral-8x7B | ORCA/GSM8K/MBXP | - | TTFT 2s |
| QA/Chat | LLAMA2-70B | OpenORCA | Rouge1=44.43 | TTFT 2s |
| 推荐 | DLRMv2 | Criteo | 80.31% AUC | 60ms |
| GNN | R-GAT | IGBH | 72.86% ACC | N/A |
| 文生图 | SDXL | COCO2014 | CLIP=31.75 | N/A |

## 附录 C：FlagPerf 评测维度

| 层级 | 内容 | AHVP 映射 |
|------|------|----------|
| 基础规格 | FP16/FP32/BF16/INT8 算力, 显存带宽/容量, P2P/MPI 互连 | 芯片评测 |
| 算子评测 | mm-FP16, sum-FP32, linear-FP16 等 | 算子性能 |
| 训练评测 | 30+ 模型, 80+ 训练样例 | 模型训练 |
| 推理评测 | TensorRT/XTCL/IxRT 引擎 | 模型推理 |

---

*文档结束。v2 在 v1 基础上重点补充: (1) 完整任务状态机+调度算法; (2) 全新模板管理含 JSON Schema + 3 个完整示例; (3) 六层评测参数详表对齐 DeepLink/MLPerf/FlagPerf; (4) 页面元素级交互描述; (5) 完整数据模型字段定义。可直接用于开发。*
