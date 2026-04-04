# AHVP 全模块详细产品设计文档 v2.1

> **文档版本:** v2.1  
> **创建日期:** 2026-04-04  
> **状态:** 全模块详细设计稿  
> **目标读者:** 产品负责人、前后端开发、测试团队、UI 设计师  
> **基于:** 客户原始 PRD 五大模块 + v2 设计 + DeepLink/FlagPerf/MLPerf 对标 + 竞品分析

---

## 文档导读

本文档是 AHVP 产品的 **全模块详细设计**，覆盖原始 PRD 的五大模块和补充模块。每个功能均以 **用户故事（User Story）** 驱动，包含完整操作闭环：前置条件 → 精确操作步骤 → 表单字段定义 → 系统响应 → 异常流程 → 后置条件。

### 文档结构

| 部分 | 内容 | 对应原始 PRD |
|------|------|------------|
| 第一部分 | 产品定位与六层评测体系 | 总纲 |
| 第二部分 | 模块 1：评测系统（US-1.1 ~ US-1.8） | 评测任务管理 |
| 第三部分 | 模块 2：评测结果与资产管理（US-2.1 ~ US-2.5） | 评测报告 + 数字资产 |
| 第四部分 | 模块 3：验证平台社区（US-3.1 ~ US-3.3） | 社区 |
| 第五部分 | 模块 4：用户体系（US-4.1 ~ US-4.3） | 用户管理 |
| 第六部分 | 模块 5：异构资源纳管（US-5.1 ~ US-5.3） | 计算资源 |
| 第七部分 | 补充：模板管理模块（12 个预置模板 + JSON Schema） | 评测模板管理 |
| 第八部分 | 补充：评测参数完整定义（6 层 × 全参数表） | - |
| 第九部分 | 补充：页面详细设计（ASCII wireframe + 交互） | - |
| 第十部分 | 数据模型设计（完整 DDL） | - |
| 附录 | 算子清单、MLPerf 对标、状态机、评分算法 | - |

---

## 第一部分：产品定位与目标

### 1.1 一句话定义

**AHVP 是一个以芯片档案为中心、以评测模板为驱动的 AI 硬件全栈验证平台，通过标准化的六层评测体系（芯片→算子→中间层→框架→模型→场景），生成可量化、可对比的芯片能力评价报告，服务于国产芯片厂商研发验证、算力采购选型和行业生态适配。**

### 1.2 六层评测体系

```
Layer 6: 场景评测 (Scenario)     — 端到端业务场景验证（推理服务/训练流水线）
Layer 5: 模型评测 (Model)        — 完整模型训练/推理性能与精度
Layer 4: 框架评测 (Framework)    — 框架兼容性、算子覆盖率、编译加速
Layer 3: 中间层评测 (Middleware)  — 编译器优化、算子融合效果
Layer 2: 算子评测 (Operator)     — 单算子精度验证 + 性能 benchmark
Layer 1: 芯片评测 (Chip)         — 裸机算力、内存带宽、通信带宽、功耗
```

### 1.3 与竞品的差异化

| 竞品 | 强项 | 弱项 | AHVP 差异 |
|------|------|------|----------|
| DeepLink AIChipBenchmark | 评测标准权威 | 无 Web 界面 | Web 可视化 + 自动化编排 |
| FlagPerf | 多芯片多框架覆盖 | 纯命令行 | 分步引导式 UI + 实时监控 |
| MLPerf | 国际黄金标准 | 门槛高、周期长 | 低门槛、按需评测 |
| 阿里云 CNP | Web UI + 分步引导 | 绑定灵骏 | 跨平台 + 芯片档案制 |
| Azure AI Foundry | UI 最成熟 | 偏模型评测 | 以芯片为中心 + 六层体系 |

---

## 第二部分：模块 1 — 评测系统（核心）

### US-1.1: 评测模板浏览与选择

**用户故事：** 作为一名芯片厂商评测工程师，我需要浏览和选择合适的评测模板，以便快速启动一次标准化的芯片评测，而不必从零配置每个评测参数。

**前置条件：** 用户已登录（评测工程师/管理员）；系统中至少存在 1 个预置模板

**操作步骤：**

1. 点击左侧导航 **「📋 评测计划」→「模板管理」**
2. 浏览模板：页面分为「系统预置模板区」（卡片网格，每行 3 张）和「我的模板区」
3. 每张卡片展示：模板名称 / 评测层级标签 / 评测项数量 / 预估耗时 / 描述 / [使用此模板] [预览] [Fork]
4. 筛选模板：评测层级(多选下拉) / 标签(多选) / 来源(全部/预置/我的) / 搜索框
5. 预览模板：点击 [预览] 弹出侧抽屉，展示完整配置（评测项清单 + 参数默认值 + 版本历史）
6. 选择使用：点击 [使用此模板] → 跳转至创建评测任务页面（US-1.3），自动填充模板配置

**系统响应：** 成功加载列表 / 空状态（"暂无模板"） / 加载中（Skeleton 占位） / 错误（Toast "加载失败"）

**异常：** 网络超时→重试按钮 / 模板被删除→Toast 提示→刷新列表 / 无权限→锁定图标

---

### US-1.2: 自定义评测模板创建

**用户故事：** 作为一名芯片厂商评测工程师，我需要创建自定义评测模板，以便根据芯片特性定制评测方案并反复使用。

**前置条件：** 用户已登录（评测工程师/管理员）

**操作步骤：**

1. 点击 [+ 创建模板] 或从预置模板 [Fork]
2. 填写基本信息：

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 模板名称 | name | 文本 | ✅ | 空/Fork时为"原名-副本" | 1-200字符 |
| 评测层级 | evaluation_layer | 单选下拉 | ✅ | 空 | chip/operator/middleware/framework/model/scenario/comprehensive |
| 描述 | description | 多行文本 | ❌ | 空 | ≤2000字符 |
| 标签 | tags | 标签输入 | ❌ | 空 | 每个≤50字符，最多10个 |

3. 选择评测项：三级选择树（L1芯片→L2算子→L3中间层→L4框架→L5模型→L6场景），右侧实时已选摘要
4. 配置默认参数：按评测类型 Tab 切换（全局/算子精度/算子性能/模型/大模型/芯片），详见第八部分
5. 保存模板：校验通过后保存，版本号 1.0.0

**校验规则：** 名称为空→"请输入模板名称" / 名称重复→"模板名称已存在" / 未选评测项→"请至少选择一个评测项"

**后置条件：** 模板创建，出现在"我的模板"列表，可用于创建评测任务

---

### US-1.3: 评测任务创建（6 步向导）

**用户故事：** 作为一名芯片厂商评测工程师，我需要基于评测模板创建评测任务，关联到目标芯片，以便系统自动拆分和调度执行。

**前置条件：** 已登录 / 至少 1 颗芯片 / 至少 1 个模板 / 至少 1 个在线节点

**操作步骤（6 步进度条：选芯片→选模板→选评测项→配参数→选节点→确认提交）：**

#### Step 1：选择目标芯片

| 字段 | 标识 | 类型 | 必填 | 校验 |
|------|------|------|------|------|
| 目标芯片 | chip_id | Radio 单选列表 | ✅ | 必须选择一颗 |

每行：单选按钮 + 芯片名 + 厂商·类型 + 评测状态Tag + 最新评分。未选时点 [下一步] 按钮抖动。

#### Step 2：选择评测模板

推荐模板区（3-5 张卡片）+ 我的模板区 + [从零开始创建 →]。选模板自动预填 Step 3/4。

| 字段 | 标识 | 类型 | 必填 |
|------|------|------|------|
| 评测模板 | template_id | 卡片选择 | ❌（可从零开始） |

#### Step 3：选择评测项

左右分栏（60:40）。左侧三级选择树，右侧已选摘要（评测项数/预计任务数/预估耗时）。分类节点支持三态复选框。

| 字段 | 标识 | 类型 | 必填 | 校验 |
|------|------|------|------|------|
| 评测项集合 | test_items | 树形多选 | ✅ | 至少选 1 项 |

#### Step 4：配置评测参数

Tab 1: **全局参数**

| 字段 | 标识 | 类型 | 必填 | 默认值 | 范围 | 单位 | 说明 |
|------|------|------|------|--------|------|------|------|
| 计划名称 | plan_name | 文本 | ✅ | "{芯片名} {模板名} {日期}" | 1-200字符 | - | 自动生成可改 |
| 最大并发 | max_concurrent | 数字 | ✅ | 4 | 1-32 | 个 | |
| 全局超时 | global_timeout | 数字 | ✅ | 86400 | 3600-604800 | 秒 | |
| 重试次数 | max_retries | 数字 | ✅ | 2 | 0-5 | 次 | |
| 基准芯片 | baseline_chip | 下拉 | ✅ | A100 | A100/H100/自定义 | - | |

Tab 2: **算子精度测试参数**（选了算子精度时显示）

| 字段 | 标识 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|------|--------|------|------|
| 数据类型 | accuracy_dtypes | 多选 | ✅ | [FP32,FP16] | FP32/FP16/BF16/INT8 | 至少选一个 |
| FP32 绝对误差 | fp32_abs | 数字 | ✅ | 1e-5 | 1e-8~1e-2 | 对齐 DeepLink |
| FP32 相对误差 | fp32_rel | 数字 | ✅ | 1e-4 | 1e-6~1e-2 | |
| FP16 绝对误差 | fp16_abs | 数字 | ✅ | 1e-3 | 1e-6~1e-1 | |
| FP16 相对误差 | fp16_rel | 数字 | ✅ | 1e-3 | 1e-6~1e-1 | |
| BF16 绝对误差 | bf16_abs | 数字 | 条件 | 1e-2 | 1e-4~1e-1 | 选BF16时 |
| BF16 相对误差 | bf16_rel | 数字 | 条件 | 1e-2 | 1e-4~1e-1 | 选BF16时 |
| 容忍率 | tolerance | 数字 | ✅ | 0.001 | 0~0.01 | |
| 测试前向 | test_fwd | 开关 | ✅ | 开 | | |
| 测试反向 | test_bwd | 开关 | ✅ | 开 | | |
| 测试模块梯度 | test_grad | 开关 | ✅ | 开 | | |

**精度判定：** `|output - baseline| <= abs_thresh + rel_thresh * |baseline|`，失败率 < tolerance 则 PASS

**参数联动：** 选FP16→FP16阈值出现；选BF16→BF16阈值出现；去勾→隐藏；选INT8→自动切换宽松阈值

Tab 3: **算子性能测试参数**（选了算子性能时显示）

| 字段 | 标识 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|------|--------|------|------|
| Shape 预设 | shape_preset | 单选 | ✅ | Medium | Small/Medium/Large/Custom | |
| 数据类型 | perf_dtypes | 多选 | ✅ | [FP16,FP32] | FP16/FP32/BF16/INT8 | |
| Warmup | warmup | 数字 | ✅ | 10 | 1-100 | 次 |
| 测试迭代 | iterations | 数字 | ✅ | 100 | 10-10000 | 次 |
| 任务超时 | timeout | 数字 | ✅ | 300 | 30-3600 | 秒 |
| 评分方式 | scoring | 下拉 | ✅ | baseline_ratio | baseline_ratio/absolute | |

**GEMM Medium 预设（对齐 DeepLink gemm_f16.csv）：**
256×256×256 / 512×512×512 / 1024×1024×1024 / 2048×2048×2048 / 4096×4096×4096 / 1024×256×1024 / 4096×1024×4096 / 8192×1024×8192

Tab 4: **模型评测参数**

| 字段 | 标识 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|------|--------|------|------|
| Batch Size | batch_sizes | 多选 | ✅ | [1,4,8,16] | 1-512 | |
| 推理迭代 | infer_iters | 数字 | ✅ | 50 | 10-1000 | |
| 推理框架 | framework | 下拉 | ✅ | auto | auto/pytorch/onnxrt/tensorrt | |
| 训练Epoch | epochs | 数字 | 条件 | 5 | 1-100 | 选训练时 |
| 收敛阈值 | convergence | 数字 | 条件 | 0.99 | 0.9-1.0 | loss cosine |
| 任务超时 | timeout | 数字 | ✅ | 600 | 60-86400 | 秒 |

Tab 5: **大模型评测参数**

| 字段 | 标识 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|------|--------|------|------|
| 序列长度 | seq_len | 数字 | ✅ | 1024 | 128-8192 | tokens |
| 输出长度 | output_len | 数字 | ✅ | 256 | 32-4096 | ≤seq_len |
| 并发数 | concurrent | 多选 | ✅ | [1,4,8] | 1-128 | |
| 场景 | scenarios | 多选 | ✅ | [Server] | Offline/Server/SingleStream | MLPerf |
| TTFT SLA | ttft_sla | 数字 | ✅ | 2000 | 100-30000 | ms |
| TPOT SLA | tpot_sla | 数字 | ✅ | 200 | 10-5000 | ms |
| 精度指标 | metrics | 多选 | ✅ | [Rouge1,Rouge2,RougeL] | Rouge/BLEU/Acc/F1 | |

**联动：** 选 Offline → TTFT/TPOT 置灰；output_len > seq_len → 标红

Tab 6: **芯片评测参数**

| 字段 | 标识 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|------|--------|------|------|
| 算力精度 | precisions | 多选 | ✅ | [FP16,FP32] | FP64/FP32/TF32/FP16/BF16/INT8 | |
| 测试方法 | method | 下拉 | ✅ | GEMM | GEMM/自定义 | |
| 内存工具 | mem_tool | 下拉 | ✅ | STREAM | STREAM/自定义 | |
| 通信工具 | comm_tool | 下拉 | ✅ | NCCL-tests | NCCL-tests/OSU | |
| 功耗间隔 | power_interval | 数字 | ✅ | 1000 | 100-10000 | ms |
| 压测时长 | stress_dur | 数字 | ✅ | 600 | 60-86400 | 秒 |

#### Step 5：选择计算节点

| 字段 | 标识 | 类型 | 必填 | 校验 |
|------|------|------|------|------|
| 计算节点 | node_ids | 多选卡片 | ✅ | 至少1个在线节点 |
| 资源模式 | resource_mode | 下拉 | ✅(多节点时) | exclusive/shared/gpu_exclusive/multi_gpu/multi_node |

节点卡片：名称 + 状态灯(🟢🔴🟡) + 硬件摘要 + 负载 + 队列。离线灰色不可选。

#### Step 6：确认并提交

计划摘要：芯片/模板/范围/节点/并发/预估任务数/预估耗时。
☑ 提交后立即执行 ☐ 保存为新模板
按钮：[← 上一步] [保存草稿] [提交并执行 ✓]

**任务拆分规则：**
- 算子精度: 每算子 × 每dtype = 1 任务
- 算子性能: 每类型 × 每dtype × 每shape = 1 任务
- 模型评测: 每模型 × 每batch × 每模式 = 1 任务
- 芯片评测: 每测试项 = 1 任务
- 大模型: 每模型 × 每并发 × 每场景 = 1 任务
- 优先级: 精度(10) > 芯片(20) > 性能(30) > 模型(40) > 大模型(50)
- 依赖: 精度 FAIL → 对应性能 SKIP

**系统响应：** 提交成功→PENDING→QUEUED→开始执行→跳转监控页 / 校验失败→定位到字段

---

### US-1.4: 评测参数配置（交互设计要点）

**用户故事：** 作为评测工程师，我需要为不同评测类型精确配置参数，以便结果符合 DeepLink/MLPerf 标准。

**设计要点：**
1. **渐进式披露**：常用参数展示，高级折叠
2. **模板预填充**：选模板后参数预填，用户微调
3. **实时预览**：改参数→右侧摘要实时更新
4. **参数联动**：选大模型训练→展示并行策略；选Offline→SLA置灰；选INT8→宽松阈值
5. **实时校验**：越界→标红+"请输入X-Y范围"；必填为空→标红
6. **导入/导出**：[导入JSON] [导出JSON] [重置默认]

---

### US-1.5: 计算节点选择与资源分配

**用户故事：** 作为评测工程师，我需要选择合适的计算节点并配置资源分配策略。

**资源分配模式：**

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| 独占 exclusive | 任务独占整个节点 | 算力/功耗测试 |
| 共享 shared | 多任务并行 | 算子精度测试 |
| GPU独占 gpu_exclusive | 独占指定GPU | GPU性能测试 |
| 多GPU multi_gpu | 使用多块GPU | 数据并行训练 |
| 多节点 multi_node | 跨多个节点 | 多机通信/大模型训练 |

**节点匹配检测：** ✅完全匹配 / ⚠️部分匹配(CPU模式) / ❌不匹配(禁止选择)

---

### US-1.6: 评测任务执行与监控

**用户故事：** 作为评测工程师，我需要实时监控评测进度，处理失败任务。

**页面结构：**
- 顶部：计划名 + 总进度条 + 状态统计(✅/🔄/⏳/❌/⏭) + 时间 + 资源仪表盘
- 中间：任务分组列表（按评测类型折叠/展开），每行：状态+名称+dtype+结果+耗时
- 失败任务区：始终展开，每行有 [🔄重试] [📋日志] [⏭跳过] [⚙️调参] 按钮
- 底部：实时日志面板（任务选择/级别过滤/搜索/自动滚动/下载）

**批量操作：** [⏸暂停全部] [▶恢复] [⛔取消计划] [🔄重试全部失败]

**三种视图：** 📋列表 / 📊分组 / 📅甘特图

**异常处理：**

| 异常 | 检测 | 自动处理 | 用户操作 |
|------|------|---------|---------|
| 超时 | 计时器 | TIMEOUT + 自动重试 | [重试][跳过][调参] |
| Agent离线 | 心跳60s | FAILED | [等待][迁移] |
| OOM | 日志检测 | FAILED | [调参重试] |
| NaN/Inf | 数值校验 | FAILED | [重试][日志] |
| 精度不达标 | 阈值比较 | FAIL + 跳过性能 | [放宽阈值] |

**数据推送：** SSE (Server-Sent Events) 实时推送

---

### US-1.7: 评测结果查看

**用户故事：** 作为评测工程师，我需要查看单个任务的详细结果。

**Tab 1 执行信息：** 任务编号/计划/芯片/类型/对象/dtype/配置/节点/时间/状态
**Tab 2 结果数据：**
- 算子精度：前向/反向的 max_abs_error / max_rel_error / fail_ratio / 判定
- 算子性能：Mean/P50/P95/P99/Min/Max 延迟 + 吞吐 + TFLOPS + 评分 + 延迟分布图
- 模型评测：延迟/吞吐/显存/精度/达标判定
**Tab 3 执行日志：** 完整日志 + 搜索 + 过滤 + 下载

---

### US-1.8: 芯片评价报告生成与查看

**用户故事：** 作为芯片厂商产品经理，我需要查看芯片综合评价报告。

**生成触发：** 所有任务终态后：完成率≥80%→完整报告 / 50-79%→部分报告+警告 / <50%→不自动生成

**报告结构（7个Section）：**

1. **能力总览：** 综合评分(0-100) + 评级(⭐) + 六维雷达图 + 能力摘要

**六维评分：**

| 维度 | 计算方式 | 权重 |
|------|---------|------|
| 计算性能 | GEMM/Conv2d/MatMul score 加权均值 | 25% |
| 访存性能 | Transpose/Embedding/Reshape score | 15% |
| 通信性能 | AllReduce/AllGather 带宽 vs 基准 | 15% |
| 算子兼容 | 精度通过率 × 100 | 20% |
| 模型性能 | 推理/训练吞吐 vs 基准 | 15% |
| 生态成熟 | 框架覆盖率 + 编译器 + 工具链 | 10% |

2. **算子精度结果：** 各dtype通过率 + 失败算子详表
3. **算子性能结果：** 延迟柱状图(Mean+P95) + 排行表 + vs基准
4. **模型评测结果：** 性能表 + 吞吐vs Batch折线图
5. **芯片规格实测：** 标称vs实测对比表
6. **瓶颈分析：** TOP3瓶颈+优化建议 + P99/P50波动分析
7. **评测环境：** 节点/软件/模板/参数快照

**导出：** [📥 PDF] [📊 Excel] [📋 DeepLink数据收集表]

---

## 第三部分：模块 2 — 评测结果与资产管理

### US-2.1: 评测报告查看与管理

**用户故事：** 作为产品经理，我需要管理历史评测报告，查看版本间性能演进趋势。

- 报告列表：编号/计划/评分/完成率/状态/时间/操作([查看][下载][归档][删除])
- 版本趋势图：2+报告时展示评分折线图(X=日期, Y=各维度评分)
- 状态管理：归档/软删除/设为默认

### US-2.2: 多报告对比分析

**用户故事：** 作为采购决策者，我需要对比多颗芯片的评测报告做选型。

- 入口：芯片列表多选→[对比] / 芯片对比页 / 报告页[与他芯对比]
- 配置：对比芯片(多选Tag) + 对比维度(多选) + 报告版本(每芯片下拉)
- 结果：雷达图叠加 + 维度评分对比表 + 算子级柱状图 + 模型性能对比
- 导出：[📥 对比报告PDF]

### US-2.3: 报告导出

**用户故事：** 作为评测工程师，我需要导出为 PDF/Excel/DeepLink 格式。

PDF选项：包含图表(开) / 原始数据(关) / 环境信息(开) / 水印 / 页面尺寸(A4)
Excel选项：AHVP标准 / DeepLink数据收集表

### US-2.4: 数字资产上传与管理

**用户故事：** 作为评测工程师，我需要上传管理评测所需数字资产。

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| 名称 | 文本 | ✅ | 1-200字符 |
| 类型 | 下拉 | ✅ | model/dataset/operator_script/eval_script/image/other |
| 描述 | 多行 | ❌ | ≤2000字符 |
| 标签 | 标签 | ❌ | 最多10个 |
| 文件 | 上传 | ✅ | ≤5GB，支持拖拽+断点续传 |
| 版本 | 文本 | ❌ | semver |

被引用资产禁止删除。

### US-2.5: 评测日志查看与下载

日志面板：级别过滤(ALL/INFO/WARN/ERROR) + 时间范围 + 搜索 + 自动滚动 + 行号 + 全屏 + 下载(.log/.json)

---

## 第四部分：模块 3 — 验证平台社区

### US-3.1: 评测榜单查看

**用户故事：** 作为采购决策者，我需要查看公开芯片评测榜单。

榜单类型(Tab)：综合榜/算力榜/推理性能榜/能效榜/算子兼容榜
每行：排名/芯片名/厂商/类型/核心指标/综合评分/评测日期/[查看详情]
筛选：芯片类型(多选)/厂商(多选)/时间/评测标准

### US-3.2: 免费资源下载

资源分类：基准镜像/评测脚本/基准值数据/最佳实践/报告模板
每卡片：名称+描述+大小+下载次数+[下载]

### US-3.3: 内容发布与互动

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| 标题 | 文本 | ✅ | 5-200字符 |
| 分类 | 下拉 | ✅ | 评测经验/技术分享/问题求助/公告 |
| 内容 | 富文本 | ✅ | ≥50字符 |
| 标签 | 标签 | ❌ | ≤5个 |
| 附件 | 上传 | ❌ | ≤5个,单个≤50MB |

互动：👍点赞/⭐收藏/💬评论(@提及)/Markdown渲染

---

## 第五部分：模块 4 — 用户体系

### US-4.1: 用户注册与认证

| 字段 | 标识 | 类型 | 必填 | 校验 |
|------|------|------|------|------|
| 用户名 | username | 文本 | ✅ | 4-30字符,字母/数字/下划线,唯一 |
| 邮箱 | email | 邮箱 | ✅ | 合法格式,不重复 |
| 密码 | password | 密码 | ✅ | 8-32字符,含大写+小写+数字 |
| 确认密码 | confirm | 密码 | ✅ | 与密码一致 |
| 手机号 | phone | 电话 | ❌ | 合法手机号 |
| 组织 | org | 文本 | ✅ | 1-200字符 |
| 角色 | role | 下拉 | ✅ | 评测工程师/产品经理/采购决策者/其他 |
| 验证码 | captcha | 图形 | ✅ | 正确输入 |

流程：注册→邮箱验证(24h有效)→管理员审核→通过→正常使用

### US-4.2: 多租户管理

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 租户名称 | 文本 | ✅ | 不重复 |
| 描述 | 多行 | ❌ | |
| 管理员邮箱 | 邮箱 | ✅ | |
| 配额-芯片数 | 数字 | ✅ | 1-1000 |
| 配额-并发 | 数字 | ✅ | 1-100 |
| 配额-存储 | 数字 | ✅ | 1-10000 GB |
| 有效期 | 日期范围 | ✅ | |

**数据隔离：** 芯片/计划/报告/资产→租户隔离 / 节点→可配共享或专用 / 社区→公开 / 榜单→仅发布的公开

### US-4.3: 角色与权限管理

| 角色 | 租户管理 | 用户管理 | 注册芯片 | 创建评测 | 查看报告 | 导出 | 对比 | 上传资产 | 社区发布 |
|------|:-------:|:-------:|:-------:|:-------:|:-------:|:----:|:----:|:-------:|:-------:|
| super_admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| tenant_admin | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| engineer | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| product_mgr | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| viewer | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |

---

## 第六部分：模块 5 — 异构资源纳管

### US-5.1: 计算节点接入

Agent 安装：`curl -fsSL https://ahvp.sensecore.cn/install-agent.sh | bash`

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| 节点名称 | 文本 | ✅ | 1-100字符,唯一 |
| 地址 | 文本 | ✅ | IP/域名+端口 |
| 令牌 | 文本 | ✅ | 32位 |
| 类型 | 下拉 | ✅ | CPU/GPU/NPU/混合 |
| 资源池 | 下拉 | ❌ | |
| 标签 | 标签 | ❌ | ≤10 |

连通性测试：[测试连接]→🟢成功+硬件信息 / 🔴失败+错误原因

### US-5.2: 资源池管理与调度

| 字段 | 类型 | 必填 |
|------|------|------|
| 名称 | 文本 | ✅ |
| 调度策略 | 下拉 | ✅ (round_robin/least_loaded/priority/affinity) |
| 节点列表 | 多选 | ✅ |
| 租户绑定 | 多选 | ❌ |

### US-5.3: 资源监控与运维

监控面板：节点总数/在线/离线/告警
节点详情：CPU/GPU/内存/显存/温度/功耗/磁盘/网络 折线图(30s刷新)

**预置告警：** 离线(心跳>2min,critical) / GPU温度>85°C(warning) / 磁盘>90%(warning) / GPU利用率=0且有任务(warning)

---

## 第七部分：补充 — 模板管理模块

### 7.1 预置模板（12 个）

| ID | 名称 | 层级 | 耗时 | 核心评测项 | 场景 |
|----|------|------|------|-----------|------|
| tpl-chip-01 | 基础规格快速核验 | L1 | 30min | FP16/FP32算力+显存带宽+通信 | 初步接入 |
| tpl-chip-02 | 全面芯片基准 | L1 | 2h | 全精度算力+显存+通信+功耗+稳定性 | 芯片定级 |
| tpl-chip-03 | 稳定性压测 | L1 | 24h | GEMM满载+功耗+温度+错误率 | 上线前 |
| tpl-op-01 | DeepLink精度全量 | L2 | 2h | 414+算子×FP32+FP16精度 | 季度评测 |
| tpl-op-02 | 核心算子性能 | L2 | 1h | GEMM/Conv2d/通信 Medium preset | 性能基准 |
| tpl-op-03 | 大模型核心算子 | L2 | 1.5h | FlashAttn+RMSNorm+SiLU+GEMM(LLM shapes) | LLM适配 |
| tpl-model-01 | DeepLink基础模型全量 | L5 | 4h | 24模型(分类9+检测10+分割5) | 季度评测 |
| tpl-model-02 | 大模型推理性能 | L5 | 3h | LLaMA-7B/70B+GPT-J+Mixtral+SDXL | 推理选型 |
| tpl-model-03 | MLPerf对标 | L5 | 6h | ResNet50+BERT+RetinaNet+GPT-J+LLaMA-70B+DLRM | 国际对标 |
| tpl-comp-01 | 快速冒烟 | 综合 | 15min | 10核心算子精度+GEMM Small+MLP | 日常CI |
| tpl-comp-02 | 标准评测 | 综合 | 4h | 50+算子+GEMM/Conv2d+24模型+规格 | 版本迭代 |
| tpl-comp-03 | 全量评测 | 综合 | 8h+ | 414+算子+24模型+大模型+全规格+通信+稳定性 | 季度/定级 |

### 7.2 模板 CRUD API

| 操作 | API | 权限 |
|------|-----|------|
| 创建 | POST /api/v1/templates | engineer+ |
| 列表 | GET /api/v1/templates | viewer+ |
| 详情 | GET /api/v1/templates/{id} | viewer+ |
| 更新 | PUT /api/v1/templates/{id} | owner |
| 删除 | DELETE /api/v1/templates/{id} | owner(非预置) |
| Fork | POST /api/v1/templates/{id}/fork | engineer+ |
| 版本 | GET /api/v1/templates/{id}/versions | viewer+ |
| 校验 | POST /api/v1/templates/validate | engineer+ |
| 导入 | POST /api/v1/templates/import | engineer+ |
| 导出 | GET /api/v1/templates/{id}/export | viewer+ |

### 7.3 模板 JSON Schema

完整 Schema 定义见 v2 文档。v2.1 新增：framework_test / middleware_test / scenario_test 三个 test_items 子对象，每个包含 enabled(bool) 和 tests(array) 字段。

---

## 第八部分：评测参数完整定义

### 8.1 芯片评测 (L1)

**算力测试：** compute_precisions(string[],≥1) / compute_method(GEMM) / matrix_size(8192,1024-65536) / warmup(50) / iterations(200)
→ 输出: tflops_measured / tflops_peak / efficiency_percent

**内存带宽：** memory_tool(STREAM) / data_size_mb(1024,64-65536) / repeat(10)
→ 输出: bandwidth_read/write/copy_tbs

**通信带宽：** comm_tool(NCCL-tests) / operations(≥1) / message_sizes(8B-1GB) / num_gpus(8) / multi_node(bool) / num_nodes(条件)
→ 输出: bandwidth_gbs / latency_us per message_size

**功耗：** power_interval(1000ms) / idle_duration(120s) / load_duration(300s) / load_method(GEMM)
→ 输出: power_idle/load/peak_w / energy_efficiency_tflops_per_w

### 8.2 算子评测 (L2)

**精度测试：** operator_name / category / data_types / fp32_abs(1e-5) / fp32_rel(1e-4) / fp16_abs(1e-3) / fp16_rel(1e-3) / bf16_abs(1e-2) / bf16_rel(1e-2) / int8_abs(1) / int8_rel(0.05) / tolerance(0.001) / test_forward/backward/module_grad / baseline_chip
判定: `|output-baseline| <= abs + rel*|baseline|`, fail_ratio < tolerance → PASS

**GEMM性能：** m/k/n(64-16384) / trans_a/b / dtype / warmup(10) / iterations(100)
**Conv2d性能：** n/c_in/h/w/c_out/k_h/k_w/padding/stride / dtype
**通信性能：** operation / message_sizes / num_gpus / backend(NCCL/HCCL/Gloo) / topology(ring/tree/auto) / warmup(5) / iterations(50)

### 8.3 中间层 (L3)
compiler(TorchDynamo/XLA/AscendCL) / optimization_level(O2) / test_models / fusion_patterns
→ 输出: compilation_time / speedup_ratio / fusion_success_rate / graph_break_count

### 8.4 框架 (L4)
framework(PyTorch/TF/MindSpore/Paddle) / version / adapter_layer(DIPU/CANN) / op_coverage / model_compat / compile_mode
→ 输出: coverage_rate(%) / fallback_list / model_pass_rate / compile_speedup

### 8.5 模型 (L5)
详见 US-1.3 Step 4 Tab 4/5

### 8.6 场景 (L6)
scenario_type / qps_target(100) / sla_p99(100ms) / duration_min(30) / concurrent_users([1,10,50,100]) / warmup_min(5)
→ 输出: max_qps / latency_p50/p95/p99 / error_rate / availability

---

## 第九部分：页面详细设计

### 9.1 全局导航

```
🏠 Dashboard
💎 芯片管理 → 芯片列表 / 芯片对比
📋 评测计划 → 计划列表 / 创建计划 / 模板管理
📊 报告管理
📦 数字资产
🖥️ 节点管理 → 节点列表 / 资源池 / 监控大盘
🏆 社区 → 评测榜单 / 资源下载 / 论坛
⚙️ 系统设置 → 用户管理 / 租户管理 / 角色权限 / 操作审计
```

### 9.2 Dashboard

统计卡片(芯片总数/评测中/已完成/待评测) + 实时评测动态(5条) + 芯片雷达图对比 + 最近计划列表 + 快速操作

### 9.3 评测监控页

进度条+状态统计 → 任务分组列表(折叠/展开) → 失败任务区(操作按钮) → 实时日志面板 → 三视图切换

### 9.4 报告页

报告头(芯片/基准/完成率/导出按钮) → 综合评分+雷达图 → 能力摘要 → 算子精度 → 算子性能 → 模型评测 → 芯片规格 → 瓶颈分析 → 评测环境

### 9.5 响应式

Desktop(≥1440): 完整 / Laptop(1024-1439): 导航收缩 / Tablet(768-1023): 抽屉导航+2列 / Mobile(<768): 底部Tab+单列

---

## 第十部分：数据模型

**核心表：** chips / evaluation_templates / evaluation_plans / evaluation_tasks / evaluation_results / chip_reports
**支撑表：** tenants / users / compute_nodes / resource_pools / digital_assets

**关键关系：**
- Chip (1) → (N) Plan (1) → (N) Task (1) → (1) Result
- Chip (1) → (N) ChipReport
- Plan (N) → (1) Template
- Task (N) → (1) Node
- Tenant (1) → (N) Chip/Plan/Report/Asset

**冗余字段：** Task/Result 中冗余 chip_id（避免多表 JOIN，提升查询性能）

完整 DDL 定义见 v2 文档第六部分，v2.1 新增：tenants 表 / users.tenant_id / compute_nodes.resource_pool_id / resource_pools 表 / digital_assets 表

---

## 附录 A：DeepLink 算子分类（22类 414+算子）

| 分类 | 数量 | 典型算子 |
|------|------|---------|
| BLAS | 18 | mm, bmm, matmul, linear, addmm |
| Convolution | 9 | conv2d, conv3d, ConvTranspose2d |
| Norm | 12 | batch_norm, layer_norm, group_norm, rms_norm |
| Activation | 20 | relu, gelu, silu, sigmoid, softmax |
| Pooling | 23 | max_pool2d, avg_pool2d, adaptive_avg_pool2d |
| Loss | 18 | cross_entropy, mse_loss, nll_loss |
| Element-wise | 109 | add, sub, mul, div, abs, exp, log, pow, sqrt |
| Reduce | 15 | sum, mean, max, min, prod, std |
| Permute | 13 | concat, split, transpose, flip |
| View_Copy | 18 | reshape, squeeze, unsqueeze, expand |
| Advanced_Indexing | 14 | index_select, masked_fill, scatter_add |
| Distribution | 23 | normal, uniform, bernoulli |
| Sort | 5 | topk, sort, argsort |
| Interpolate | 4 | interpolate, grid_sample |
| Communication | 15 | all_reduce, all_gather, reduce_scatter |
| Dropout | 10 | dropout, dropout2d |
| Optimizer | 17 | sgd, adam, adamw |
| Broadcast | 18 | repeat, expand, broadcast_to |
| Composite | 7 | addcmul, addcdiv, baddbmm |
| Linalg | 34 | svd, det, inverse, eig, qr |
| Pad | 2 | pad, constant_pad |
| MISC | 10 | nonzero, unique, meshgrid |

## 附录 B：MLPerf Inference v5.0 对标

| 任务 | 模型 | 数据集 | 参考精度 | Server延迟 |
|------|------|--------|---------|-----------|
| 分类 | ResNet50 | ImageNet | 76.46% ACC | 15ms |
| 检测 | RetinaNet | OpenImages | 0.3755 mAP | 100ms |
| 分割 | 3D-UNet | KiTS2019 | 0.8633 DICE | N/A |
| QA | BERT-Large | SQuAD v1.1 | 90.874% F1 | 130ms |
| 摘要 | GPT-J 6B | CNN DailyMail | Rouge1=42.99 | TTFT 20s |
| 混合 | Mixtral-8x7B | ORCA/GSM8K | - | TTFT 2s |
| QA | LLAMA2-70B | OpenORCA | Rouge1=44.43 | TTFT 2s |
| 推荐 | DLRMv2 | Criteo | 80.31% AUC | 60ms |
| GNN | R-GAT | IGBH | 72.86% ACC | N/A |
| 文生图 | SDXL | COCO2014 | CLIP=31.75 | N/A |

## 附录 C：任务状态机

```
DRAFT → PENDING → QUEUED → RUNNING → COMPLETED → REPORT_READY
                                   → FAILED → RETRYING → QUEUED
                                   → TIMEOUT → RETRYING → QUEUED
DRAFT → DELETED
PENDING → REJECTED
RUNNING → CANCELLED / PAUSED → QUEUED
QUEUED → CANCELLED
任意非终态 → SKIPPED
终态: COMPLETED / REPORT_READY / CANCELLED / DELETED / SKIPPED
```

## 附录 D：评分算法

**算子评分：** `score(op, dtype) = baseline_latency / test_latency` (>1优于基准)

**维度评分：** `dim_score = Σ(weight_i × score_i) / Σ(weight_i) × 100`
权重: MatMul=5, Conv2d=4, Norm=3, 激活=2, 其他=1

**综合评分：** `overall = Σ(dim_weight × dim_score) / Σ(dim_weight)`
权重: 计算25% / 访存15% / 通信15% / 算子兼容20% / 模型15% / 生态10%

**评级：** ≥90优秀⭐⭐⭐⭐⭐ / 75-89良好⭐⭐⭐⭐ / 60-74合格⭐⭐⭐ / <60待改进⭐⭐

---

*v2.1 核心改进：(1) 全 5 模块 + 补充模块详细设计 (2) 22 个用户故事含完整操作闭环 (3) 所有表单字段定义(名称/类型/必填/校验/默认值) (4) 6层评测完整参数表 (5) 12个预置模板 (6) 核心页面 wireframe + 交互 (7) 完整数据模型 (8) 评分算法公式*
