# 评测参数配置模块设计文档（US-1.4）

> **版本**: v1.0  
> **日期**: 2026-05-11  
> **作者**: 菜菜子 (AI PM)  
> **状态**: Draft — 待 chenxi review  
> **关联**: PRD §1.3-1.9（全栈评测）、Gap Analysis 2026-05-08、Issue #179

---

## 1. 目标与范围

### 1.1 要解决什么问题

PRD 要求平台覆盖 **"芯片 → 算子 → 中间层 → 框架 → 模型 → 场景"** 六层全栈评测，每层有显著不同的参数需求（如芯片评测需要精度类型、互联模式；算子评测需要输入形状、融合策略；模型评测需要 batch size、量化方法等）。

当前系统仅实现了一个 **通用 EvalConfigStep**（统一配置面板），所有评测类型共用同一套参数表单。这导致：

1. **参数不完整** — 无法覆盖每层特有的配置项（如芯片的 TDP 监控、算子的输入 tensor shape、中间层的 runtime 选择等）
2. **参数混杂** — 不同层的参数混在一起，用户困惑，容易误配
3. **模板预填不精准** — `TEMPLATE_PARAMS` 仅按模板 ID 预填，缺少按评测维度动态切换配置面板的能力

### 1.2 目标

- **P0**: 为 6 层评测各自提供独立的参数配置面板（Tab），每层展示该层专属参数
- **P0**: 保持向后兼容 — 现有 `evalConfig` JSON 数据无损迁移
- **P1**: 支持 JSON 导入/导出、模板预填、配置摘要预览（复用已有能力）
- **P2**: 支持配置校验规则（如芯片评测必须选精度、算子评测必须填输入形状）

### 1.3 不包含

- 自主编排系统（US-1.2，独立 feature）
- 评测执行引擎改造（Agent 端不在此范围）
- 评测报告生成逻辑

---

## 2. 现状分析

### 2.1 已有什么

| 组件 | 路径 | 作用 |
|------|------|------|
| `EvalConfigStep.js` | `frontend/src/components/tasks/steps/` | 通用评测参数表单（数据集、GPU、精度、batch size、指标、高级参数） |
| `PrecisionConfigTab.js` | `frontend/src/components/tasks/` | 芯片精度评测专属面板（基准/目标精度、量化方法、误差阈值）— **已存在但未集成到主流程** |
| `taskConstants.js` | `frontend/src/components/tasks/` | 预置模板（6 类）、GPU 选项、精度选项、状态常量 |
| `templateConstants.js` | `frontend/src/components/templates/` | 评测维度枚举 (`EVAL_DIMENSIONS`: CHIP/OPERATOR/MODEL/FRAMEWORK/MIDDLEWARE/SCENE) |
| `EvaluationTask.java` | `backend/.../task/` | 实体类，`eval_config` 为 JSONB 字段，`dimension` 字段已存在 |
| `TaskTemplate.java` | `backend/.../template/` | 模板实体，`evaluation_layer` 字段已存在 |
| `evaluation_tasks` 表 | DB | `eval_config jsonb` + `dimension varchar(32)` 已就绪 |

### 2.2 缺什么

| 缺失项 | 优先级 | 说明 |
|--------|--------|------|
| 六层独立配置面板组件 | P0 | 芯片/算子/中间层/框架/模型/场景各一个 Tab 组件 |
| 按 `dimension` 动态切换面板 | P0 | EvalConfigStep 根据所选评测维度显示对应面板 |
| 每层专属参数定义 | P0 | 前后端统一的参数 schema |
| 后端参数校验 | P1 | 按 dimension 校验 evalConfig 必填字段 |
| 配置面板的联动逻辑 | P1 | 如选芯片 → 自动加载该芯片支持的精度列表 |

---

## 3. 六层参数模型

### 3.1 总体结构

```
evalConfig = {
  "dimension": "CHIP",           // 评测维度（路由 key）
  "common": { ... },             // 通用参数（所有层共享）
  "chip": { ... },               // 芯片层专属参数
  "operator": { ... },           // 算子层专属参数
  "middleware": { ... },         // 中间层专属参数
  "framework": { ... },         // 框架层专属参数
  "model": { ... },             // 模型层专属参数
  "scene": { ... }              // 场景层专属参数
}
```

**设计原则**：前端根据 `dimension` 值只展示 `common` + 对应层的面板；后端存储完整 JSON；向后兼容：旧数据中没有 `dimension` 字段的默认按 `common` 处理。

### 3.2 通用参数（common）— 所有层共享

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `datasetSource` | enum | `"preset"` | 数据集来源（preset / custom） |
| `datasetId` | string | — | 数据集 ID |
| `precision` | enum | `"FP16"` | 精度类型（FP32/FP16/BF16/INT8） |
| `batchSize` | number | 32 | Batch Size |
| `gpuType` | string | — | GPU/芯片型号 |
| `gpuCount` | number | 1 | GPU 数量 |
| `metrics` | string[] | [] | 评测指标列表 |
| `timeout` | number | 60 | 超时时间（分钟） |
| `retryCount` | number | 0 | 自动重试次数 |
| `retryInterval` | number | 10 | 重试间隔（分钟） |
| `warmupRuns` | number | 3 | Warmup 次数 |
| `testRuns` | number | 5 | 正式运行次数 |
| `enableAlert` | boolean | true | 异常告警 |
| `alertEmail` | string[] | [] | 告警邮箱 |

### 3.3 芯片层参数（chip）

> 对应 PRD §1.8 芯片性能评测 + §1.9 芯片精度评测

| 参数 | 类型 | 说明 |
|------|------|------|
| `testMode` | enum | 测试模式：`single_card` / `multi_card` / `cluster` |
| `cardCount` | number | 测试卡数（multi_card / cluster 时必填） |
| `interconnectTest` | boolean | 是否测试多卡互联性能 |
| `interconnectType` | enum | 互联类型：`NVLink` / `PCIe` / `RoCE` / `HCCS` |
| `stabilityDurationHours` | number | 稳定性测试时长（小时），默认 72 |
| `powerMonitoring` | boolean | 是否监控功耗/TDP |
| `targetPrecisions` | string[] | 目标精度列表（精度评测用） |
| `baselinePrecision` | string | 基准精度（精度评测用） |
| `quantMethod` | enum | 量化方法：`PTQ` / `QAT` / `GPTQ` / `AWQ` / `SmoothQuant` |
| `errorThreshold` | number | 精度误差阈值（%） |
| `stressTest` | boolean | 是否进行压力测试 |
| `mtbfTarget` | number | MTBF 目标（小时） |

### 3.4 算子层参数（operator）

> 对应 PRD §1.7 算子性能评测

| 参数 | 类型 | 说明 |
|------|------|------|
| `operatorType` | enum | 算子类型：`Conv` / `BN` / `ReLU` / `Pool` / `Linear` / `Softmax` / `Custom` |
| `customOperatorName` | string | 自定义算子名称 |
| `inputShapes` | string[] | 输入 tensor 形状列表，如 `["1x3x224x224", "4x3x224x224"]` |
| `fusionEnabled` | boolean | 是否测试算子融合 |
| `fusionPattern` | enum | 融合模式：`Conv+BN+ReLU` / `Linear+Softmax` / `Custom` |
| `precisionList` | string[] | 测试精度列表（可多选） |
| `compatibilityTest` | boolean | 是否进行跨芯片/框架兼容性测试 |
| `targetChips` | number[] | 兼容性测试目标芯片 ID 列表 |
| `targetFrameworks` | string[] | 兼容性测试目标框架列表 |
| `benchmarkIterations` | number | 基准测试迭代次数，默认 1000 |

### 3.5 中间层参数（middleware）

> 对应 PRD §1.6 中间层性能评测

| 参数 | 类型 | 说明 |
|------|------|------|
| `runtimeType` | enum | Runtime 类型：`cuDNN` / `MKL` / `TensorRT` / `ONNX_Runtime` / `Custom` |
| `runtimeVersion` | string | Runtime 版本号 |
| `operatorLibrary` | string | 算子库名称（如 `CANN`, `BANG`） |
| `memoryTest` | boolean | 是否测试内存调度效率 |
| `memoryMetrics` | string[] | 内存指标：`alloc_latency` / `fragment_rate` / `bandwidth_util` |
| `commTest` | boolean | 是否测试通信效率 |
| `commPatterns` | string[] | 通信模式：`all_reduce` / `all_gather` / `broadcast` / `reduce_scatter` |
| `commBackend` | enum | 通信后端：`NCCL` / `HCCL` / `Gloo` / `MPI` |
| `schedulingBenchmark` | boolean | 是否测试 runtime 调度延迟 |

### 3.6 框架层参数（framework）

> 对应 PRD §1.5 框架性能评测

| 参数 | 类型 | 说明 |
|------|------|------|
| `frameworkName` | enum | 框架名称：`PyTorch` / `MindSpore` / `PaddlePaddle` / `TensorFlow` / `OneFlow` |
| `frameworkVersion` | string | 框架版本号 |
| `inferenceEngine` | enum | 推理引擎：`SGLang` / `vLLM` / `TensorRT` / `LMDeploy` / `Native` |
| `installTest` | boolean | 是否测试安装成功率 |
| `modelLoadTest` | boolean | 是否测试模型加载成功率 |
| `operatorCoverage` | boolean | 是否测试算子支持率 |
| `compareFrameworks` | string[] | 对比框架列表（框架间性能对比） |
| `optimizationSuggestion` | boolean | 是否生成优化建议 |
| `compatChips` | number[] | 适配测试目标芯片 ID 列表 |

### 3.7 模型层参数（model）

> 对应 PRD §1.3 模型性能评测

| 参数 | 类型 | 说明 |
|------|------|------|
| `modelId` | number | 评测对象（模型）ID |
| `modelVersion` | string | 模型版本 |
| `testType` | enum | 测试类型：`inference` / `training` / `both` |
| `inferenceConfig.maxSeqLen` | number | 最大序列长度（LLM 用） |
| `inferenceConfig.concurrency` | number | 并发请求数 |
| `inferenceConfig.inputPromptLen` | number | 输入 prompt 平均长度 |
| `inferenceConfig.outputTokenLen` | number | 输出 token 平均长度 |
| `trainingConfig.epochs` | number | 训练轮次 |
| `trainingConfig.learningRate` | number | 学习率 |
| `trainingConfig.mixedPrecision` | boolean | 是否混合精度训练 |
| `trainingConfig.distributedMode` | enum | 分布式模式：`dp` / `ddp` / `fsdp` / `megatron` / `deepspeed` |
| `trainingConfig.gradAccumSteps` | number | 梯度累积步数 |
| `quantConfig.enabled` | boolean | 是否进行量化测试 |
| `quantConfig.methods` | string[] | 量化方法列表 |
| `quantConfig.calibrationDataset` | string | 校准数据集 ID |

### 3.8 场景层参数（scene）

> 对应 PRD §1.4 场景效果评测

| 参数 | 类型 | 说明 |
|------|------|------|
| `sceneType` | enum | 行业场景：`government` / `medical` / `industrial` / `finance` / `traffic` / `education` / `custom` |
| `sceneName` | string | 场景名称（custom 时必填） |
| `businessMetrics` | object[] | 业务指标定义 `[{name, type, threshold, unit}]` |
| `customEvalScript` | string | 自定义评估脚本路径 |
| `comparisonBaseline` | object | 对比基线 `{chipId, modelId, score}` |
| `deploymentConfig.replicas` | number | 部署副本数 |
| `deploymentConfig.servingFramework` | enum | 服务框架：`triton` / `vllm` / `sglang` / `custom` |
| `outputRecommendation` | boolean | 是否输出适配方案建议 |
| `outputFormat` | enum | 方案输出格式：`pdf` / `word` / `json` |

---

## 4. 数据模型设计

### 4.1 evalConfig JSON 结构（完整示例）

```json
{
  "dimension": "CHIP",
  "common": {
    "datasetSource": "preset",
    "datasetId": "12",
    "precision": "FP16",
    "batchSize": 64,
    "gpuType": "ascend_910b",
    "gpuCount": 4,
    "metrics": ["算力(TOPS)", "能效比(TOPS/W)", "互联带宽(GB/s)"],
    "timeout": 120,
    "retryCount": 1,
    "retryInterval": 10,
    "warmupRuns": 3,
    "testRuns": 5,
    "enableAlert": true,
    "alertEmail": ["test@ahvp.com"]
  },
  "chip": {
    "testMode": "multi_card",
    "cardCount": 4,
    "interconnectTest": true,
    "interconnectType": "NVLink",
    "stabilityDurationHours": 72,
    "powerMonitoring": true,
    "targetPrecisions": ["FP16", "INT8"],
    "baselinePrecision": "FP32",
    "quantMethod": "PTQ",
    "errorThreshold": 1.0,
    "stressTest": true,
    "mtbfTarget": 5000
  }
}
```

### 4.2 向后兼容策略

现有 `evalConfig` 数据结构为扁平 JSON（所有字段平铺在根层级）。迁移策略：

1. **读取时自动适配**：后端解析 `evalConfig` 时检测 `dimension` 字段是否存在
   - 有 `dimension` → 新格式，按 `common` + 层专属解析
   - 无 `dimension` → 旧格式，整个 JSON 视为 `common`，正常工作
2. **写入时使用新格式**：前端提交时统一写新格式
3. **不做数据迁移**：旧数据保持原样，读取兼容即可（零风险）

```java
// EvalConfigParser.java — 兼容逻辑伪代码
public EvalConfigDTO parse(String evalConfigJson) {
    JsonNode root = objectMapper.readTree(evalConfigJson);
    if (root.has("dimension")) {
        // 新格式
        return parseNewFormat(root);
    } else {
        // 旧格式 — 整个 JSON 作为 common
        return EvalConfigDTO.builder()
            .dimension("GENERAL")
            .common(root)
            .build();
    }
}
```

### 4.3 数据库 Schema 变更

**无需新增表或字段**。原因：
- `evaluation_tasks.eval_config` 已是 JSONB，结构变化在 JSON 内部
- `evaluation_tasks.dimension` 字段已存在（varchar(32)）
- `task_templates.evaluation_layer` 字段已存在（varchar(32)）

唯一变更：**确保 `dimension` 字段在创建任务时被正确填写**（当前可能为 null）。

```sql
-- 可选：回填旧数据的 dimension 字段
UPDATE evaluation_tasks
SET dimension = COALESCE(
  eval_config::jsonb ->> 'dimension',
  CASE eval_type
    WHEN 'CHIP' THEN 'CHIP'
    WHEN 'MODEL' THEN 'MODEL'
    WHEN 'FRAMEWORK' THEN 'FRAMEWORK'
    WHEN 'OPERATOR' THEN 'OPERATOR'
    ELSE 'GENERAL'
  END
)
WHERE dimension IS NULL;
```

---

## 5. API 设计

### 5.1 现有 API（无需修改）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tasks` | 创建任务 — `evalConfig` 字段直接接受新 JSON 格式 |
| GET | `/api/tasks/{id}` | 获取任务详情 — 返回原始 `evalConfig` |
| PUT | `/api/tasks/{id}` | 更新任务 — 同上 |

**无需新增 API endpoint**，因为 `evalConfig` 是 JSONB，前端传什么后端存什么。

### 5.2 新增 API

#### 5.2.1 获取维度参数 Schema（P1）

```
GET /api/eval-config/schema?dimension=CHIP
```

**用途**：前端动态获取某个评测维度的参数定义（字段名、类型、校验规则、默认值），支持后端驱动的表单渲染。

**响应示例**：
```json
{
  "dimension": "CHIP",
  "fields": [
    {
      "key": "chip.testMode",
      "label": "测试模式",
      "type": "select",
      "options": ["single_card", "multi_card", "cluster"],
      "required": true,
      "default": "single_card"
    },
    {
      "key": "chip.cardCount",
      "label": "测试卡数",
      "type": "number",
      "min": 1,
      "max": 128,
      "required": false,
      "visibleWhen": { "chip.testMode": ["multi_card", "cluster"] }
    }
  ]
}
```

> **设计决策**：V1 阶段 schema 硬编码在前端常量文件中（零后端改造成本）。V2 阶段迁移到后端 API，支持动态扩展。

#### 5.2.2 参数校验（P1）

```
POST /api/eval-config/validate
Body: { "dimension": "CHIP", "evalConfig": { ... } }
Response: { "valid": true, "errors": [] }
```

**用途**：提交前调用，返回参数校验结果。V1 阶段前端本地校验，V2 迁移到后端。

### 5.3 现有 API 的行为变更

| API | 变更 | 说明 |
|-----|------|------|
| `POST /api/tasks` | 后端校验 `dimension` 非空 | 新建任务时 dimension 必填 |
| `GET /api/tasks` | 无变更 | 列表返回照旧 |

---

## 6. 前端设计

### 6.1 整体 UI 结构

```
TaskCreateModal
└── Steps
    ├── Step 0: ModeSelectStep (选择模式)
    ├── Step 1: BasicInfoStep / TemplateSelectStep
    │   └── 新增: 选择「评测维度」下拉框（dimension）
    ├── Step 2: EvalConfigStep (评测配置) ← 改造重点
    │   ├── 通用参数面板 (CommonConfigPanel) — 始终显示
    │   └── 维度专属面板 (按 dimension 动态切换)
    │       ├── ChipConfigPanel
    │       ├── OperatorConfigPanel
    │       ├── MiddlewareConfigPanel
    │       ├── FrameworkConfigPanel
    │       ├── ModelConfigPanel
    │       └── SceneConfigPanel
    ├── Step 3: NodeSelectStep / ConfirmStep
    └── Step 4: ConfirmStep
```

### 6.2 EvalConfigStep 改造方案

**核心思路**：将当前 EvalConfigStep 拆分为 `CommonConfigPanel`（通用参数）+ 6 个维度专属面板，通过 Tabs 切换。

```jsx
// EvalConfigStep.js 改造后的核心结构
export default function EvalConfigStep({ form, dimension, ...props }) {
  return (
    <Row gutter={24}>
      <Col xs={24} lg={16}>
        {/* 通用参数 — 始终展示 */}
        <CommonConfigPanel form={form} {...props} />
        
        <Divider />
        
        {/* 维度专属参数 — 按 dimension 动态渲染 */}
        {dimension === 'CHIP' && <ChipConfigPanel form={form} />}
        {dimension === 'OPERATOR' && <OperatorConfigPanel form={form} />}
        {dimension === 'MIDDLEWARE' && <MiddlewareConfigPanel form={form} />}
        {dimension === 'FRAMEWORK' && <FrameworkConfigPanel form={form} />}
        {dimension === 'MODEL' && <ModelConfigPanel form={form} />}
        {dimension === 'SCENE' && <SceneConfigPanel form={form} />}
      </Col>
      
      <Col xs={24} lg={8}>
        <ConfigSummaryPanel form={form} dimension={dimension} />
      </Col>
    </Row>
  );
}
```

### 6.3 新增前端文件

```
frontend/src/components/tasks/
├── evalConfig/
│   ├── index.js                    # 统一导出
│   ├── CommonConfigPanel.js        # 通用参数（从 EvalConfigStep 抽取）
│   ├── ChipConfigPanel.js          # 芯片层配置
│   ├── OperatorConfigPanel.js      # 算子层配置
│   ├── MiddlewareConfigPanel.js    # 中间层配置
│   ├── FrameworkConfigPanel.js     # 框架层配置
│   ├── ModelConfigPanel.js         # 模型层配置
│   ├── SceneConfigPanel.js         # 场景层配置
│   ├── ConfigSummaryPanel.js       # 配置摘要（从 EvalConfigStep 抽取）
│   └── evalConfigConstants.js      # 各层参数常量、选项、默认值
├── PrecisionConfigTab.js           # 已有 → 合并到 ChipConfigPanel
└── steps/
    └── EvalConfigStep.js           # 改造 → 路由到子面板
```

### 6.4 维度选择交互

**在 BasicInfoStep 中新增维度选择**：

```jsx
<Form.Item name="dimension" label="评测维度" rules={[{ required: true }]}>
  <Select placeholder="选择评测维度">
    <Option value="CHIP">🔧 芯片评测</Option>
    <Option value="OPERATOR">⚙️ 算子评测</Option>
    <Option value="MIDDLEWARE">📦 中间层评测</Option>
    <Option value="FRAMEWORK">🧩 框架评测</Option>
    <Option value="MODEL">🤖 模型评测</Option>
    <Option value="SCENE">🎯 场景评测</Option>
  </Select>
</Form.Item>
```

**模板模式自动设置**：选择模板时，根据模板的 `evaluationLayer` 自动填充 `dimension`，跳过手动选择。

### 6.5 PrecisionConfigTab 处理

现有 `PrecisionConfigTab.js` 的内容（基准精度、目标精度、量化方法、误差阈值）将 **合并到 `ChipConfigPanel`** 中作为"精度评测"子区域。原文件标记 deprecated 但保留，避免破坏性变更。

---

## 7. 实现计划

按优先级拆分为 5 个可独立交付的 Issue：

### Issue 1: 前端重构 — 抽取通用面板 + 路由框架 (P0, 3d)

**Scope**:
- 创建 `evalConfig/` 目录结构
- 从 `EvalConfigStep.js` 抽取 `CommonConfigPanel.js` 和 `ConfigSummaryPanel.js`
- 改造 `EvalConfigStep.js` 为路由组件（按 dimension 渲染不同面板）
- 在 `BasicInfoStep.js` 新增 dimension 选择
- 无 dimension 时降级为原有通用面板（兼容）

**验收**: 选择任意 dimension，通用参数正常展示；不选 dimension 时行为与改造前一致。

### Issue 2: 芯片 + 算子配置面板 (P0, 3d)

**Scope**:
- 实现 `ChipConfigPanel.js`（合并 PrecisionConfigTab 内容 + 新增互联/稳定性/压力测试参数）
- 实现 `OperatorConfigPanel.js`（算子类型、输入形状、融合测试参数）
- 新增 `evalConfigConstants.js` 中对应常量

**验收**: 创建芯片评测任务，专属参数完整显示并可配置；JSON 导出包含 `chip` 子对象。

### Issue 3: 框架 + 模型配置面板 (P0, 3d)

**Scope**:
- 实现 `FrameworkConfigPanel.js`（框架选择、推理引擎、适配测试）
- 实现 `ModelConfigPanel.js`（推理/训练配置、量化配置）

**验收**: 创建模型评测任务，可配置推理/训练参数；创建框架评测任务，可选择框架和推理引擎。

### Issue 4: 中间层 + 场景配置面板 (P1, 2d)

**Scope**:
- 实现 `MiddlewareConfigPanel.js`（runtime 选择、内存/通信测试）
- 实现 `SceneConfigPanel.js`（行业场景、业务指标、部署配置）

**验收**: 6 层面板全部可用。

### Issue 5: 后端校验 + 模板联动 (P1, 2d)

**Scope**:
- 后端 `CreateTaskRequest` 增加 `dimension` 非空校验
- 实现 `EvalConfigValidator.java`，按 dimension 校验必填字段
- 模板选择时自动设置 dimension + 预填专属参数
- 回填 SQL 脚本（旧数据 dimension 填充）

**验收**: 提交缺少必填参数时返回明确错误；模板选择后自动跳转到对应配置面板。

### 时间线

```
Week 1 (5/12-5/16): Issue 1 + Issue 2
Week 2 (5/19-5/23): Issue 3 + Issue 4
Week 3 (5/26-5/28): Issue 5 + 集成测试
总计: ~13 工作日
```

---

## 8. 测试策略

### 8.1 单元测试

| 层 | 测试内容 | 方式 |
|----|----------|------|
| 前端 | 各 ConfigPanel 组件渲染、表单交互、联动逻辑 | Jest + React Testing Library |
| 后端 | EvalConfigParser 兼容性（新旧格式）、EvalConfigValidator 校验规则 | JUnit 5 |

### 8.2 集成测试

| 场景 | 步骤 | 预期 |
|------|------|------|
| 芯片评测全流程 | 创建任务 → 选 dimension=CHIP → 配置芯片参数 → 提交 | evalConfig 包含 common + chip |
| 旧数据兼容 | 查看历史任务详情 | 旧 evalConfig 正常展示（降级到通用面板） |
| 模板预填 | 选择"芯片性能评测"模板 → 自动跳到芯片面板 | dimension=CHIP，参数预填正确 |
| JSON 导入导出 | 导出 → 修改 → 导入 | 参数正确回填到对应面板 |
| 参数校验 | 芯片评测不选精度直接提交 | 弹出校验提示 |

### 8.3 回归测试

- **关键路径**: 不选 dimension（旧模式）创建任务，验证与改造前行为一致
- **数据完整性**: 创建任务后查看 DB `eval_config` 字段，确认 JSON 结构正确
- **模板系统**: 所有 6 个预置模板正常工作

### 8.4 每层参数验证矩阵

| 维度 | 必填项验证 | 联动验证 | 边界值验证 |
|------|-----------|----------|-----------|
| CHIP | testMode, precision | cardCount 仅 multi_card 时显示 | stabilityDurationHours: 1~168 |
| OPERATOR | operatorType, inputShapes | fusionPattern 仅 fusionEnabled=true 时显示 | benchmarkIterations: 100~100000 |
| MIDDLEWARE | runtimeType | commPatterns 仅 commTest=true 时显示 | — |
| FRAMEWORK | frameworkName | inferenceEngine 列表按框架过滤 | — |
| MODEL | modelId, testType | trainingConfig 仅 testType=training/both 时显示 | batchSize: 1~1024 |
| SCENE | sceneType | businessMetrics 仅 custom 时必填 | replicas: 1~64 |

---

## 9. 风险与决策点

| # | 风险/决策 | 建议 | 需要讨论 |
|---|----------|------|----------|
| 1 | Schema API 是否需要后端实现？ | V1 前端硬编码，V2 再迁移后端 | ✅ 确认 |
| 2 | PrecisionConfigTab 是否保留独立文件？ | 标记 deprecated，内容合并到 ChipConfigPanel | — |
| 3 | 旧数据是否需要跑迁移脚本？ | 建议不跑，读取时兼容即可 | ✅ 确认 |
| 4 | dimension 字段是复用现有 evaluation_tasks.dimension 还是新加？ | 复用现有字段（已存在 varchar(32)） | — |
| 5 | 场景评测的业务指标定义是否过早？ | 先实现框架，具体指标后续迭代 | ✅ 确认 |

---

## 10. 附录

### 10.1 现有 EVAL_DIMENSIONS 与新面板的映射

| templateConstants.js 枚举 | dimension 值 | 配置面板 |
|---------------------------|-------------|---------|
| EVAL_DIMENSIONS.CHIP | `CHIP` | ChipConfigPanel |
| EVAL_DIMENSIONS.OPERATOR | `OPERATOR` | OperatorConfigPanel |
| EVAL_DIMENSIONS.MIDDLEWARE | `MIDDLEWARE` | MiddlewareConfigPanel |
| EVAL_DIMENSIONS.FRAMEWORK | `FRAMEWORK` | FrameworkConfigPanel |
| EVAL_DIMENSIONS.MODEL | `MODEL` | ModelConfigPanel |
| EVAL_DIMENSIONS.SCENE | `SCENE` | SceneConfigPanel |

### 10.2 现有 TEMPLATE_PARAMS 与 dimension 的映射

| 模板 ID | dimension | 说明 |
|---------|-----------|------|
| `chip_perf` | CHIP | 芯片性能评测 |
| `model_accuracy` | MODEL | 模型精度评测 |
| `model_perf` | MODEL | 模型推理性能 |
| `framework_compat` | FRAMEWORK | 框架兼容性评测 |
| `operator_perf` | OPERATOR | 算子性能评测 |
| `scene_effect` | SCENE | 场景效果评测 |
