# AHVP 评测模块产品设计文档 v2.2

> **文档版本:** v2.2
> **创建日期:** 2026-04-14
> **状态:** 合并版详细设计稿（v2.0 + v2.1 + 报告模板增强）
> **变更记录:**
> - v2.2.1 (2026-04-14): 根据 #432 评审反馈更新（场景加权/生态量化/瓶颈诊断增强/慢节点检测修正/Token配置统一/NCCL独立配置）
> - v2.2 (2026-04-14): 合并报告模板增强设计，统一评分体系为 vs L40S 百分比，扩展至八维评价
> - v2.1 (2026-04-04): 全模块详设，22个用户故事，12个预置模板
> - v2.0 (2026-04-04): 评测模块详细设计，六层评测体系

---

## 文档导读

本文档是 AHVP 产品的 **全模块详细设计**，覆盖原始 PRD 的五大模块和补充模块。每个功能均以 **用户故事（User Story）** 驱动，包含完整操作闭环：前置条件 → 精确操作步骤 → 表单字段定义 → 系统响应 → 异常流程 → 后置条件。

### v2.2 核心变更

| 变更项 | v2.1 | v2.2 | 说明 |
|--------|------|------|------|
| 评分体系 | 0-100 绝对评分 + 五星评级 | **vs L40S 百分比** | 不做主观打分，所有维度以基准芯片百分比呈现 |
| 评价维度 | 六维（计算/访存/通信/算子/模型/生态） | **八维**（计算/访存/通信/算子/训练/推理/扩展性/生态） | 训练和推理独立评价，新增扩展性维度 |
| 基准芯片 | A100（硬编码） | **L40S（可配置）** | 默认 L40S，支持切换为 A100/H100 等 |
| 报告结构 | 7 个 Section，训练/推理合并 | **增强版**，训练/推理独立章节，新增 NCCL 通信、Decode/Prefill 分离、Token 配置矩阵 | 对齐行业实际评测报告结构 |
| 瓶颈分析 | TOP3 瓶颈 + 建议 | **自动瓶颈诊断逻辑** | 基于规则自动定位瓶颈并生成建议 |

### 文档结构

| 部分 | 内容 | 包含 US | 对应原始 PRD |
|------|------|--------|------------|
| 第一部分 | 产品定位与六层评测体系 | — | 总纲 |
| 第二部分 | 模块 1：评测系统 | US-1.1 模板浏览、US-1.2 自定义模板、US-1.3 任务创建、US-1.4 参数配置、US-1.5 节点选择、US-1.6 执行监控、US-1.7 结果查看、US-1.8 报告生成 | 评测任务管理 |
| 第三部分 | 模块 2：评测结果与资产管理 | US-2.1 报告管理、US-2.2 多报告对比、US-2.3 报告导出、US-2.4 数字资产管理、US-2.5 日志查看 | 评测报告 + 数字资产 |
| 第四部分 | 模块 3：验证平台社区 | US-3.1 评测榜单、US-3.2 资源下载、US-3.3 内容发布 | 社区 |
| 第五部分 | 模块 4：用户体系 | US-4.1 注册认证、US-4.2 多租户管理、US-4.3 角色权限 | 用户管理 |
| 第六部分 | 模块 5：异构资源纳管 | US-5.1 节点接入、US-5.2 资源池管理、US-5.3 资源监控 | 计算资源 |
| 第七部分 | 补充：模板管理模块（12 个预置模板 + JSON Schema） | — | 评测模板管理 |
| 第八部分 | 补充：评测参数完整定义（6 层 × 全参数表） | — | - |
| 第九部分 | 补充：页面详细设计（ASCII wireframe + 交互） | — | - |
| 第十部分 | 数据模型设计（完整 DDL） | — | - |
| 附录 | 算子清单、MLPerf 对标、状态机、评分算法 | — | - |

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

### 1.4 八维评价体系 ★ v2.2 新增

> v2.2 将原六维评价扩展为八维，训练和推理独立评价，新增扩展性维度。所有维度以 **vs 基准芯片（默认 L40S）百分比** 呈现，不做主观打分。

| 维度 | 计算方式 | 说明 |
|------|---------|------|
| **算力** | 实测 TFLOPS / L40S 实测 TFLOPS | GEMM/Conv2d 等算力测试 |
| **访存** | 实测带宽 / L40S 实测带宽 | 内存读写带宽 |
| **通信** | 实测互联 / L40S 实测互联 | AllReduce/AllGather 等集合通信 |
| **算子** | 精度通过率 × 性能均值 / L40S | 综合精度和性能 |
| **训练** | 训练吞吐几何平均 / L40S | 多模型训练 Tokens/s 或 Samples/s |
| **推理** | 推理 TGS 几何平均 / L40S | 多模型推理 Output TGS |
| **扩展性** | 8 卡扩展效率 / L40S 8 卡扩展效率 | 多卡并行效率 |
| **生态** | `(通过框架数/测试框架数×0.5 + 量化格式支持数/标准量化格式数×0.3 + 算子覆盖率×0.2) / L40S同指标 × 100%` | 量化评估 |

**颜色规则：** ≥100% 绿色（持平或超越基准），80%-99% 黄色（接近基准），<80% 红色（显著落后）

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
| 基准芯片 | baseline_chip | 下拉 | ✅ | L40S | L40S/A100/H100/自定义 | - | ★ v2.2: 默认改为 L40S（可配置） |

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
| Token 配置 | token_configs | 配置矩阵 | ✅ | 见下方预设 | - | ★ v2.2 新增 |
| Decode/Prefill 分离 | measure_prefill_decode | 开关 | ✅ | 开 | - | ★ v2.2 新增 |
| SLA 约束 | sla_constraints | 对象 | ✅ | 见下方 | - | ★ v2.2 新增 |

**★ v2.2 新增：Token 配置矩阵预设**

| 配置编号 | 输入 Tokens | 输出 Tokens | 场景描述 |
|---------|:---:|:---:|------|
| C1 | 128 | 1024 | 短问题长回答（日常对话） |
| C2 | 1024 | 1024 | 中等输入等长回答 |
| C3 | 1024 | 8192 | 中等输入超长回答（文章生成） |
| C4 | 2048 | 2048 | 等长中等序列 |
| C5 | 8192 | 1024 | 长文档短摘要 |
| C6 | 18000 | 400 | 超长上下文短回答 |
| C7 | 3300 | 400 | 中长输入短回答 |

**★ v2.2 新增：SLA 约束**

| 约束 | 默认值 | 说明 |
|------|--------|------|
| max_prefill_latency_ms | 3000 | 首 token 延迟上限 |
| max_decode_latency_ms | 50 | 单 token 生成延迟上限 |
| ttft_sla_ms | 2000 | Time to First Token |
| tpot_sla_ms | 200 | Time Per Output Token |

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
| NCCL 通信测试 | nccl_test_enabled | 开关 | ✅ | 开 | - | ★ v2.2 新增 |

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
- 大模型: 每模型 × 每并发 × 每场景 × 每Token配置 = 1 任务（★ v2.2: 增加 Token 配置维度）
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
- 算子性能：Mean/P50/P95/P99/Min/Max 延迟 + 吞吐 + TFLOPS + vs 基准百分比 + 延迟分布图
- 模型评测：延迟/吞吐/显存/精度/达标判定
- ★ v2.2 推理结果：增加 Decode TGS / Prefill TGS / TTFT / TPOT / SLA 达标判定
**Tab 3 执行日志：** 完整日志 + 搜索 + 过滤 + 下载

---

### US-1.8: 芯片评价报告生成与查看 ★ v2.2 重大增强

**用户故事：** 作为芯片厂商产品经理，我需要查看芯片综合评价报告。

**生成触发：** 所有任务终态后：完成率≥80%→完整报告 / 50-79%→部分报告+警告 / <50%→不自动生成

#### 报告整体结构（v2.2 增强版）

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
├── 7. 综合评价（八维 vs L40S 百分比）
│   ├── 7.1 综合能力概览
│   ├── 7.2 分段详细结论
│   ├── 7.3 适用场景评估
│   └── 7.4 瓶颈分析与优化建议
├── 8. 评测环境与方法论
└── 附录
```

#### Section 2：芯片硬件规格概览 ★ v2.2 新增

**2.1 目标芯片规格卡片**

以卡片形式展示被测芯片的核心参数（数据来源：芯片档案）：

| 字段 | 示例值 | 数据来源 |
|------|--------|---------|
| 芯片名称 | 摩尔线程 S5000 | 芯片档案 |
| 厂商 | 摩尔线程 | 芯片档案 |
| 架构 | MUSA 3.0 | 芯片档案 |
| FP32 TFLOPS | 256 | 芯片档案 specs |
| FP16 TFLOPS | 512 | 芯片档案 specs |
| 显存容量 | 80 GB | 芯片档案 specs |
| 显存类型 | GDDR6 | 芯片档案 specs |
| 显存带宽 | 1.6 TB/s | 芯片档案 specs |
| 互联带宽 | 800 GB/s | 芯片档案 specs |
| TDP | 450 W | 芯片档案 specs |

**2.2 竞品规格对比表**

横向对比被测芯片与基准芯片（L40S）、其他芯片：

| 字段 | 被测芯片 | NVIDIA L40S (基准) | NVIDIA A100 | 华为 910C | ... |
|------|---------|-------------------|-------------|-----------|-----|
| FP16 TFLOPS | — | 362 | 312 | 780 | ... |
| 显存 (GB) | — | 48 | 80 | 128 | ... |
| 显存带宽 (TB/s) | — | 0.864 | 2.0 | 3.2 | ... |
| 互联带宽 (GB/s) | — | 450 | 600 | 700 | ... |

**可视化方案:** 分组柱状图 + 被测芯片高亮

**数据模型扩展（Chip.specs）：**

```json
{
  "fp64_tflops": null,
  "fp32_tflops": 256,
  "tf32_tflops": null,
  "fp16_tflops": 512,
  "bf16_tflops": null,
  "fp8_tflops": 1024,
  "int8_tops": null,
  "memory_gb": 80,
  "memory_type": "GDDR6",
  "memory_bandwidth_tbps": 1.6,
  "interconnect_bandwidth_gbps": 800,
  "interconnect_type": "MUSA Link",
  "tdp_watts": 450,
  "process_node": "7nm",
  "mass_production_status": "mass_production",
  "launch_date": "2025-Q2",
  "supported_precisions": ["FP64", "FP32", "FP16", "BF16", "FP8"]
}
```

#### Section 3.5：NCCL 通信性能测试 ★ v2.2 新增

> 基于 [NVIDIA nccl-tests](https://github.com/NVIDIA/nccl-tests)，评测机内多卡集合通信性能。
> 对于非 NVIDIA 芯片，使用对应的通信库测试工具（如 MCCL-tests、HCCL-tests），指标定义保持一致。

**测试工具映射：**

| 芯片厂商 | 通信库 | 测试工具 | 测试命令 |
|---------|--------|---------|----------|
| NVIDIA | NCCL | nccl-tests | `all_reduce_perf` / `all_reduce_perf_mpi` |
| 华为昇腾 | HCCL | hccl-tests | `all_reduce_test` |
| 摩尔线程 | MCCL | mccl-tests | `all_reduce_perf` |
| 其他国产 | 各自实现 | 对应测试工具 | 参数保持一致 |

**标准测试命令：**

```bash
# === NVIDIA GPU 机内 8 卡 AllReduce ===
./build/all_reduce_perf -b 8 -e 8G -f 2 -g 8 -n 20 -w 5

# === 华为昇腾 910C 机内 16 NPU AllReduce ===
mpirun -np 16 all_reduce_test -p 16 -b 1G -e 16G -f 2 -w 5 -n 20 -c 1
```

**测试参数：**

| 参数 | 值 | 说明 |
|------|------|------|
| 消息大小范围 | 8B ~ 8GB | 覆盖小消息延迟和大消息带宽场景 |
| 步进方式 | ×2 (factor=2) | 对数均匀扫描 |
| GPU/NPU 数量 | 8 或 16 (机内全卡) | 测试机内全卡互联带宽 |
| 迭代次数 | 20 | 确保结果稳定 |
| 预热迭代 | 5 | 排除冷启动影响 |
| 数据类型 | float (FP32) | 默认，可额外测试 fp16/bf16 |
| 操作 | AllReduce (Sum) | 训练场景最关键的集合通信 |

**核心指标：**

| 指标 | 定义 | 说明 |
|------|------|------|
| **Bus Bandwidth (busbw)** | `algbw × 2×(n-1)/n` | ⭐ **核心指标**，反映硬件互联带宽的实际利用率 |
| Algorithm Bandwidth (algbw) | `S / t` | 算法带宽，会随 GPU 数量变化 |
| Latency | 操作时间 (ms) | 小消息场景的延迟 |
| 带宽利用率 | busbw / 硬件峰值带宽 | 衡量通信库优化程度 |

> ℹ️ **为什么用 Bus Bandwidth**：AllReduce 的算法带宽会随卡数增加而下降，而 Bus Bandwidth 经过校正后可以直接与硬件峰值对比。参考 [NCCL Tests PERFORMANCE.md](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md)。

**慢节点检测标准：** 单节点 busbw < 所有节点 busbw 中位数 × 0.8 → 标记为疑似慢节点

**测试项目：**

| 测试项 | 优先级 | 场景 |
|---------|:---:|------|
| **AllReduce** | 必测 | 训练梯度同步 |
| **AlltoAll** | 建议 | MoE 模型的 Expert Parallel |
| **AllGather** | 可选 | 模型并行参数收集 |
| **ReduceScatter** | 可选 | ZeRO 优化器状态分割 |

**结果展示 — 摘要卡片（AllReduce 为主）：**

| 指标 | 被测芯片 | L40S (基准) | **vs L40S** |
|------|---------|-----------|:---:|
| 峰值 Bus Bandwidth (GB/s) | — | — | —% |
| 小消息延迟 (8B~1KB, µs) | — | — | —% |
| 带宽利用率 (busbw / 硬件峰值) | —% | —% | — |

**结果展示 — 详细表（关键消息大小点）：**

| 消息大小 | 被测芯片 busbw (GB/s) | L40S busbw (GB/s) | **vs L40S** | 延迟 (ms) |
|---------|:---:|:---:|:---:|:---:|
| 8 B | — | — | —% | — |
| 1 KB | — | — | —% | — |
| 1 MB | — | — | —% | — |
| 256 MB | — | — | —% | — |
| 1 GB | — | — | —% | — |
| 8 GB | — | — | —% | — |

**可视化：** 带宽-消息大小曲线图（对数X轴）+ 带宽利用率柱状图

**数据模型：**

```json
{
  "result_type": "nccl_allreduce",
  "test_tool": "nccl-tests",
  "comm_library": "NCCL 2.21.5",
  "num_gpus": 8,
  "scope": "intra_node",
  "datatype": "float",
  "operation": "allreduce_sum",
  "iterations": 20,
  "warmup_iterations": 5,
  "results": [
    {"message_size_bytes": 8, "algbw_gbps": 0.01, "busbw_gbps": 0.02, "latency_us": 25.3},
    {"message_size_bytes": 1073741824, "algbw_gbps": 280.5, "busbw_gbps": 490.8, "latency_us": 3820}
  ],
  "summary": {
    "peak_busbw_gbps": 490.8,
    "small_msg_latency_us": 25.3,
    "hw_peak_bandwidth_gbps": 800,
    "bandwidth_utilization": 0.614
  },
  "baseline_comparison": {
    "baseline_chip": "NVIDIA_L40S",
    "baseline_peak_busbw_gbps": 440.2,
    "vs_baseline_peak_busbw": 1.115
  }
}
```

#### Section 5：训练性能评测 ★ v2.2 新增

**5.1 训练性能摘要**

> **基准芯片: NVIDIA L40S = 100%**，所有性能值均以 L40S 实测值为基准换算百分比。

| 指标 | 说明 | 呈现方式 |
|------|------|----------|
| vs L40S 平均训练性能 | 所有模型训练吞吐的几何平均比值 | **百分比** |
| 最优模型 | 相对 L40S 性能比最高的模型 | 模型名 + 百分比 |
| 最弱模型 | 相对 L40S 性能比最低的模型 | 模型名 + 百分比 |
| 关键瓶颈 | 自动诊断的主要性能瓶颈 | 文字描述 |

**5.2 分模型训练吞吐对比**

**关键指标:** Samples/s/GPU（传统模型）或 Tokens/s/GPU（语言模型）

**当前阶段模型列表（与评测模板中 24 基础模型 + 小模型对齐）：**

| 模型 | 类别 | 指标 | 说明 |
|------|------|------|------|
| MLP-Medium | 基础 | Samples/s/GPU | 基础算力验证 |
| ResNet-50 | 分类 | Samples/s/GPU | 经典 CV 基准 |
| ResNet-101 | 分类 | Samples/s/GPU | 较大 CV 模型 |
| BERT-Base | NLP | Tokens/s/GPU | NLP 基准 |
| BERT-Large | NLP | Tokens/s/GPU | 较大 NLP 模型 |
| GPT-J-6B | LLM | Tokens/s/GPU | 小规模 LLM 基准 |
| LLaMA2-7B | LLM | Tokens/s/GPU | 主流小模型 |
| RetinaNet | 检测 | Samples/s/GPU | 目标检测 |
| 3D-UNet | 分割 | Samples/s/GPU | 医学分割 |

> **⚠️ 注意：** 当前 GPU 资源有限，模型列表以小模型为主。DeepSeek-R1-671B、Qwen3-235B 等大模型评测为 **未来扩展**（需多卡 + 大显存环境），当前阶段不纳入预置模板。

**结果表：**

| 模型 | 模型规模 | 被测芯片 (Samples or Tokens)/s/GPU | L40S (基准) | **vs L40S** |
|------|---------|:---:|:---:|:---:|
| MLP-Medium | — | — | — | —% |
| ResNet-50 | 25M | — | — | —% |
| BERT-Base | 110M | — | — | —% |
| GPT-J-6B | 6B | — | — | —% |
| LLaMA2-7B | 7B | — | — | —% |

**可视化：** 分组柱状图 + 性能比值热力图

**数据模型：**

```json
{
  "result_type": "model_training",
  "model_name": "LLaMA2-7B",
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

**5.3 多卡扩展性分析**

| 卡数 | 被测芯片 Tokens/s | 理想线性扩展 | 实际扩展效率 | L40S 扩展效率 |
|:---:|:---:|:---:|:---:|:---:|
| 1 | — | — | 100% | 100% |
| 2 | — | — | —% | —% |
| 4 | — | — | —% | —% |
| 8 | — | — | —% | —% |

**可视化:** 折线图（虚线=理想线性，实线=实际）

**5.4 训练稳定性与收敛性**

| 指标 | 说明 |
|------|------|
| Loss 收敛曲线 | 与基准芯片的 loss 曲线对比 |
| Loss Cosine Similarity | 与基准芯片的 loss 序列余弦相似度（>0.99 为 PASS） |
| 梯度一致性 | 前 N 步梯度与基准的余弦相似度 |
| 长时间训练稳定性 | 无 NaN/Inf、无性能退化 |

#### Section 6：推理性能评测 ★ v2.2 新增

**6.1 推理性能摘要**

> **基准芯片: NVIDIA L40S = 100%**

| 指标 | 说明 | 呈现方式 |
|------|------|----------|
| vs L40S 平均推理性能 | 所有模型/配置的 Output TGS 几何平均比值 | **百分比** |
| 最优场景 | 相对 L40S 性能比最高的模型+配置 | 模型名 + 配置 + 百分比 |
| 最弱场景 | 相对 L40S 性能比最低的模型+配置 | 模型名 + 配置 + 百分比 |
| Decode vs Prefill 倾向 | Decode 和 Prefill 哪个相对更强/更弱 | 文字描述 |
| SLA 达标率 | 满足延迟约束的配置占比 | 百分比 |

**6.2 多模型横评**

**当前阶段模型列表：**

| 模型 | 规模 | 场景 | 量化 | 说明 |
|------|------|------|------|------|
| MLP-Medium | — | 推理 | FP32 | 基础推理基准 |
| ResNet-50 | 25M | 推理 | FP16 | CV 推理基准 |
| BERT-Base | 110M | 推理 | FP16 | NLP 推理基准 |
| BERT-Large | 340M | 推理 | FP16 | 较大 NLP 模型 |
| GPT-J-6B | 6B | 推理 | FP16 | 小规模 LLM |
| LLaMA2-7B | 7B | 推理 | FP16 | 主流小模型 |

> **⚠️ 未来扩展（需大显存多卡环境）：** DeepSeek-R1-671B (INT8)、Qwen3-235B (INT8)、DeepSeek-V3-70B (FP16/INT8)、Qwen3-vl-235B 多模态 (INT8)、LLaMA3-70B (FP16/INT8) 等大模型将在 GPU 资源充足后纳入评测。当前阶段架构已预留支持。

**6.3 输入输出配置矩阵**

每个 LLM 模型（GPT-J-6B、LLaMA2-7B）× 每个配置的综合结果表：

| 模型 | 配置 | 被测芯片 Output TGS | L40S (基准) | **vs L40S** |
|------|------|:---:|:---:|:---:|
| LLaMA2-7B | C1 (128/1024) | — | — | —% |
| LLaMA2-7B | C2 (1024/1024) | — | — | —% |
| LLaMA2-7B | C4 (2048/2048) | — | — | —% |
| GPT-J-6B | C1 (128/1024) | — | — | —% |
| GPT-J-6B | C7 (3300/400) | — | — | —% |

**可视化：** 分组柱状图 + 热力图（模型 × 配置的性能比值矩阵）+ 雷达图

**6.4 Decode / Prefill 详细分析**

推理性能拆分为两个阶段：

| 阶段 | 含义 | 关键指标 |
|------|------|---------|
| **Prefill** | 处理输入 tokens（计算密集） | Prefill TGS (tokens/s)、Prefill 延迟 (ms) |
| **Decode** | 逐 token 生成输出（访存密集） | Decode TGS (tokens/s)、TPOT (ms/token) |

**详细结果表（每个 LLM 模型一张）：**

| 输入/输出 | 约束条件 | 被测 Decode TGS | L40S Decode | **vs L40S** | 被测 Prefill TGS | L40S Prefill | **vs L40S** |
|-----------|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| C1: 128/1024 | prefill<3000ms, decode<50ms | — | — | —% | — | — | —% |
| C2: 1024/1024 | prefill<3000ms, decode<50ms | — | — | —% | — | — | —% |
| C4: 2048/2048 | prefill<3000ms, decode<50ms | — | — | —% | — | — | —% |
| C7: 3300/400 | prefill<3000ms, decode<50ms | — | — | —% | — | — | —% |

**约束条件说明：** 不满足约束的数据点标记为 "SLA Fail"

**可视化：** 双 Y 轴柱状图 + 散点图（Prefill vs Decode）

**数据模型：**

```json
{
  "result_type": "model_inference",
  "model_name": "LLaMA2-7B",
  "model_size": "7B",
  "quantization": "FP16",
  "inference_config": {
    "input_tokens_range": [128, 128],
    "output_tokens_range": [1024, 1024],
    "config_label": "C1",
    "batch_size": 1,
    "num_gpus": 1,
    "inference_engine": "vLLM",
    "constraints": {
      "max_prefill_latency_ms": 3000,
      "max_decode_latency_ms": 50
    }
  },
  "metrics": {
    "decode_tgs": 1109.3,
    "prefill_tgs": 9657.3,
    "ttft_ms": 450,
    "tpot_ms": 0.9,
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

**6.5 并发性能与 SLA 达标率**

| 并发数 | 被测芯片 QPS | L40S QPS | **vs L40S** | P99 延迟 (ms) | SLA 达标率 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | — | — | —% | — | —% |
| 4 | — | — | —% | — | —% |
| 8 | — | — | —% | — | —% |
| 16 | — | — | —% | — | —% |

**SLA 标准（对齐 MLPerf）：** TTFT ≤ 2000ms / TPOT ≤ 200ms / 错误率 < 1%

**6.6 多模态推理（可选，未来扩展）**

> ⚠️ **当前版本不实现此功能。报告生成时如无多模态评测数据，此章节自动隐藏。**
>
> 当前阶段暂不实现。待 GPU 资源充足、Qwen3-vl 等多模态模型可用时启用。

#### Section 7：综合评价（v2.2 增强版）

**7.1 综合能力概览（基于 L40S 基准）**

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
| 生态 | `(通过框架数/测试框架数×0.5 + 量化格式支持数/标准量化格式数×0.3 + 算子覆盖率×0.2) / L40S同指标 × 100%` | —% | 量化评估 |

**7.2 分段详细结论**

不做梯队划分，按场景分段陈述事实性结论：

**训练场景结论示例：**
> 被测芯片在 7B 模型训练场景下达到 L40S 的 **135%**，表现突出。
> 但大模型训练仅达到 L40S 的 **48%**，主要瓶颈在显存带宽。

**推理场景结论示例：**
> 短输入短输出场景（C1: 128/1024）达到 L40S 的 **112%**。
> 长输入场景（C5: 8192/1024）下降至 L40S 的 **67%**，Prefill 阶段成为瓶颈。

**7.3 适用场景评估**

> 不做星级推荐，直接用 vs L40S 百分比说话：

| 场景 | vs L40S | 结论 |
|------|:---:|------|
| 小模型训练（7B 及以下） | —% | — |
| 小模型推理（7B 及以下） | —% | — |
| CV 模型（ResNet/RetinaNet） | —% | — |
| NLP 模型（BERT） | —% | — |
| 分布式训练（8卡+） | —%（效率比） | — |

**★ 场景加权视图（展示层增强，不改评分算法）**

> 除默认的八维等权几何平均外，报告可切换"按场景看"的加权视图，帮助不同选型需求的用户聚焦关键维度：

| 场景 | 加权方式 | 说明 |
|------|---------|------|
| **推理选型** | 推理 30% + 算子 25% + 计算 15% + 访存 15% + 生态 15% | 侧重推理和算子适配 |
| **训练选型** | 训练 25% + 通信 20% + 扩展性 20% + 计算 15% + 算子 10% + 访存 10% | 侧重训练吞吐和多卡效率 |
| **混合场景（默认）** | 八维等权几何平均 | 不加权，全面均衡评估 |

> ⚠️ 加权视图仅影响展示层排序和综合比值计算，不改变各维度的独立百分比值。

**7.4 瓶颈分析与优化建议（自动诊断逻辑）**

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

IF 算子精度通过率 < 90%:
  → 瓶颈: 软件栈适配不足
  → 建议: 重点优化未通过算子，检查 DIPU/CANN 适配层

IF 小消息延迟(8B-1KB) vs L40S > 150%:
  → 瓶颈: 通信启动开销（launch latency）
  → 建议: 检查通信库初始化开销，排查 PCIe 拓扑

IF 单卡推理强但多卡训练弱:
  → 瓶颈: 通信成为训练瓶颈
  → 建议: 检查梯度同步策略，考虑梯度压缩
```

**导出：** [📥 PDF] [📊 Excel] [📋 DeepLink数据收集表]

---

## 第三部分：模块 2 — 评测结果与资产管理

### US-2.1: 评测报告查看与管理 ★ v2.2 增强

**用户故事：** 作为产品经理，我需要管理历史评测报告，查看版本间性能演进趋势。

- 报告列表：编号/计划/vs L40S 综合比值/完成率/状态/时间/操作([查看][下载][归档][删除])
- 版本趋势图：2+报告时展示各维度 vs L40S 百分比折线图(X=日期, Y=百分比)
- 状态管理：归档/软删除/设为默认

**★ v2.2 变更：** 报告列表中「综合评分」列由原来的 0-100 分改为 **vs L40S 综合比值百分比**，趋势图 Y 轴也改为百分比。

### US-2.2: 多报告对比分析

**用户故事：** 作为采购决策者，我需要对比多颗芯片的评测报告做选型。

- 入口：芯片列表多选→[对比] / 芯片对比页 / 报告页[与他芯对比]
- 配置：对比芯片(多选Tag) + 对比维度(多选) + 报告版本(每芯片下拉)
- 结果：八维雷达图叠加（vs L40S 百分比）+ 维度对比表 + 算子级柱状图 + 模型性能对比
- ★ v2.2 新增：训练/推理分开对比视图、Decode/Prefill 分离对比
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

榜单类型(Tab)：综合榜/算力榜/推理性能榜/训练性能榜/能效榜/算子兼容榜
每行：排名/芯片名/厂商/类型/核心指标(vs L40S 百分比)/时间/[查看详情]
筛选：芯片类型(多选)/厂商(多选)/时间/评测标准

**★ v2.2 变更：** 榜单改用 vs L40S 百分比排序，新增训练性能榜。

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
| tpl-chip-02 | 全面芯片基准 | L1 | 2h | 全精度算力+显存+通信+功耗+稳定性+NCCL通信 | 芯片定级 |
| tpl-chip-03 | 稳定性压测 | L1 | 24h | GEMM满载+功耗+温度+错误率 | 上线前 |
| tpl-op-01 | DeepLink精度全量 | L2 | 2h | 414+算子×FP32+FP16精度 | 季度评测 |
| tpl-op-02 | 核心算子性能 | L2 | 1h | GEMM/Conv2d/通信 Medium preset | 性能基准 |
| tpl-op-03 | 大模型核心算子 | L2 | 1.5h | FlashAttn+RMSNorm+SiLU+GEMM(LLM shapes) | LLM适配 |
| tpl-model-01 | DeepLink基础模型全量 | L5 | 4h | 24模型(分类9+检测10+分割5) | 季度评测 |
| tpl-model-02 | 小模型推理性能 | L5 | 2h | GPT-J-6B+LLaMA2-7B+BERT+ResNet-50 | 推理选型 |
| tpl-model-03 | MLPerf对标 | L5 | 6h | ResNet50+BERT+RetinaNet+GPT-J+SDXL | 国际对标 |
| tpl-comp-01 | 快速冒烟 | 综合 | 15min | 10核心算子精度+GEMM Small+MLP | 日常CI |
| tpl-comp-02 | 标准评测 | 综合 | 4h | 50+算子+GEMM/Conv2d+24模型+规格 | 版本迭代 |
| tpl-comp-03 | 全量评测 | 综合 | 8h+ | 414+算子+24模型+小模型LLM+全规格+NCCL通信+稳定性 | 季度/定级 |

> **★ v2.2 变更：** tpl-model-02 改为「小模型推理性能」（原「大模型推理性能」），模型列表调整为 GPT-J-6B/LLaMA2-7B/BERT/ResNet-50 等小模型。tpl-chip-02 和 tpl-comp-03 新增 NCCL 通信测试。所有模板的基准芯片默认改为 L40S。

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

完整 Schema 定义见 v2 文档。v2.1 新增：framework_test / middleware_test / scenario_test 三个 test_items 子对象。

**★ v2.2 新增参数扩展：**

> ⚠️ v2.2.1 变更：`nccl_test` 从 `llm_evaluation` 下移至顶层独立配置项（与 `llm_evaluation` 平级），因为 NCCL 通信测试属于芯片基础性能（L1），不仅服务于 LLM 评测。

```json
{
  "llm_evaluation": {
    "token_configs": [
      {"label": "C1", "input_tokens": 128, "output_tokens": 1024, "description": "短问题长回答"},
      {"label": "C2", "input_tokens": 1024, "output_tokens": 1024, "description": "中等等长"},
      {"label": "C3", "input_tokens": 1024, "output_tokens": 8192, "description": "中输入超长输出"},
      {"label": "C4", "input_tokens": 2048, "output_tokens": 2048, "description": "中等等长"},
      {"label": "C5", "input_tokens": 8192, "output_tokens": 1024, "description": "长文档短摘要"},
      {"label": "C6", "input_tokens": 18000, "output_tokens": 400, "description": "超长上下文短回答"},
      {"label": "C7", "input_tokens": 3300, "output_tokens": 400, "description": "中长输入短回答"}
    ],
    "sla_constraints": {
      "max_prefill_latency_ms": 3000,
      "max_decode_latency_ms": 50,
      "ttft_sla_ms": 2000,
      "tpot_sla_ms": 200
    },
    "measure_prefill_decode_separately": true
  },
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
```

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

**★ v2.2 新增 — NCCL 通信详细测试：** 详见 US-1.8 Section 3.5

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

统计卡片(芯片总数/评测中/已完成/待评测) + 实时评测动态(5条) + 芯片雷达图对比（八维 vs L40S）+ 最近计划列表 + 快速操作

### 9.3 评测监控页

进度条+状态统计 → 任务分组列表(折叠/展开) → 失败任务区(操作按钮) → 实时日志面板 → 三视图切换

### 9.4 报告页 ★ v2.2 增强

报告头(芯片/基准芯片/完成率/导出按钮) → 执行摘要 → 芯片规格概览 → 芯片基础性能(含 NCCL 通信) → 算子评测 → **训练性能评测** → **推理性能评测**(含 Decode/Prefill) → 综合评价(八维 vs L40S 雷达图) → 瓶颈分析 → 评测环境

### 9.5 响应式

Desktop(≥1440): 完整 / Laptop(1024-1439): 导航收缩 / Tablet(768-1023): 抽屉导航+2列 / Mobile(<768): 底部Tab+单列

---

## 第十部分：数据模型设计

**核心表：** chips / evaluation_templates / evaluation_plans / evaluation_tasks / evaluation_results / chip_reports

**evaluation_results.result_type 枚举值：**

| 枚举值 | 说明 |
|--------|------|
| `chip_compute` | 芯片算力测试（L1） |
| `chip_memory` | 芯片访存测试（L1） |
| `chip_communication` | 芯片通信测试（L1） |
| `chip_power` | 芯片功耗测试（L1） |
| `nccl_allreduce` | ★ NCCL AllReduce 通信测试（L1） |
| `operator_accuracy` | 算子精度测试（L2） |
| `operator_performance` | 算子性能测试（L2） |
| `model_training` | 模型训练评测（L5） |
| `model_inference` | 模型推理评测（L5） |
**支撑表：** tenants / users / compute_nodes / resource_pools / digital_assets

**关键关系：**
- Chip (1) → (N) Plan (1) → (N) Task (1) → (1) Result
- Chip (1) → (N) ChipReport
- Plan (N) → (1) Template
- Task (N) → (1) Node
- Tenant (1) → (N) Chip/Plan/Report/Asset

**冗余字段：** Task/Result 中冗余 chip_id（避免多表 JOIN，提升查询性能）

完整 DDL 定义见 v2 文档第六部分，v2.1 新增：tenants 表 / users.tenant_id / compute_nodes.resource_pool_id / resource_pools 表 / digital_assets 表

### ★ v2.2 ChipReport 表扩展

```sql
ALTER TABLE chip_reports ADD COLUMN training_summary JSONB;
ALTER TABLE chip_reports ADD COLUMN inference_summary JSONB;
ALTER TABLE chip_reports ADD COLUMN baseline_chip VARCHAR(50) DEFAULT 'NVIDIA_L40S';
ALTER TABLE chip_reports ADD COLUMN scenario_recommendations JSONB;
```

**training_summary 结构：**

```json
{
  "baseline_chip": "NVIDIA_L40S",
  "vs_baseline_avg_ratio": 1.35,
  "best_model": {"name": "LLaMA2-7B", "vs_baseline": 1.35},
  "worst_model": {"name": "GPT-J-6B", "vs_baseline": 0.88},
  "model_results": [
    {
      "model_name": "LLaMA2-7B",
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
```

**inference_summary 结构：**

```json
{
  "baseline_chip": "NVIDIA_L40S",
  "vs_baseline_avg_ratio": 1.12,
  "model_results": [
    {
      "model_name": "LLaMA2-7B",
      "model_size": "7B",
      "quantization": "FP16",
      "configs": [
        {
          "config_label": "C1",
          "input_tokens": "128",
          "output_tokens": "1024",
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

## 附录 D：评分算法 ★ v2.2 重大变更

### v2.2 评分体系：vs L40S 百分比

> **核心变更：** 废弃 0-100 绝对评分和五星评级，统一为 **vs 基准芯片（默认 L40S）百分比**。
> 100% = 与 L40S 持平，>100% = 超越基准，<100% = 落后于基准。

**算子评分：** `score(op, dtype) = baseline_latency / test_latency × 100%`

**维度评分（八维）：**

| 维度 | 计算方式 | 说明 |
|------|---------|------|
| 算力 | `实测TFLOPS / L40S实测TFLOPS × 100%` | 取 FP16/FP32 加权均值 |
| 访存 | `实测带宽 / L40S实测带宽 × 100%` | STREAM 测试结果 |
| 通信 | `实测busbw / L40S实测busbw × 100%` | AllReduce 峰值 Bus Bandwidth |
| 算子 | `(精度通过率 × 性能几何均值) / L40S × 100%` | 综合精度和性能 |
| 训练 | `训练吞吐几何平均 / L40S训练吞吐几何平均 × 100%` | 所有模型训练 Tokens/s or Samples/s |
| 推理 | `推理TGS几何平均 / L40S推理TGS几何平均 × 100%` | 所有模型推理 Output TGS |
| 扩展性 | `8卡扩展效率 / L40S 8卡扩展效率 × 100%` | 多卡并行效率 |
| 生态 | `(通过框架数/测试框架数×0.5 + 量化格式支持数/标准量化格式数×0.3 + 算子覆盖率×0.2) / L40S同指标 × 100%` | 量化评估 |

**综合比值：** `overall = 几何平均(八维百分比)`

**颜色规则：** ≥100% 绿色 / 80%-99% 黄色 / <80% 红色

> **与 v2.1 评分对照：**
> - v2.1: `overall = Σ(dim_weight × dim_score) / Σ(dim_weight)`，0-100 分 + 五星评级
> - v2.2: 所有维度独立以 vs L40S 百分比呈现，综合用几何平均，不做星级评定

## 附录 E：可视化组件清单 ★ v2.2 新增

| 组件 | 用途 | 库建议 |
|------|------|--------|
| **分组柱状图** | 多芯片训练/推理吞吐对比 | ECharts / Chart.js |
| **堆叠柱状图** | Decode + Prefill 分解 | ECharts |
| **雷达图（八维）** | 芯片综合能力画像（vs L40S 百分比） | ECharts |
| **热力图** | 模型 × 配置的性能比值矩阵 | ECharts |
| **折线图** | 多卡扩展性、Loss 收敛曲线 | ECharts |
| **散点图** | Prefill vs Decode 性能分布 | ECharts |
| **表格（可排序）** | 详细数据展示 | Ant Design Table |
| **卡片** | 芯片规格、总览指标 | 自定义组件 |
| **带宽-消息大小曲线** | NCCL AllReduce busbw 随消息大小变化 | ECharts（对数X轴） |
| **基准比值徽章** | vs L40S 百分比标记（绿/黄/红） | 自定义组件 |

---

*v2.2 核心改进：(1) 评分体系统一为 vs L40S 百分比，废弃绝对评分 (2) 评价维度从六维扩展为八维 (3) 基准芯片默认 L40S（可配置） (4) 报告结构增强：训练/推理独立章节、NCCL 通信测试、Decode/Prefill 分离、Token 配置矩阵 (5) 自动瓶颈诊断逻辑 (6) 芯片规格概览与竞品对比 (7) 模型列表保持小模型为主（GPU 资源约束），大模型标记为未来扩展*
