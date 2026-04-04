# AHVP 全模块详细产品设计文档 v3.0

> **版本:** v3.0
> **日期:** 2026-04-04
> **作者:** 菜菜子（基于麦克雷 v2.1 评审修改）
> **状态:** 评审修改稿
> **变更说明:** 基于 v2.1 评审的 15 条意见全部修改，补全模块3/4/5，新增计费/编排/错误码等章节

## 版本历史

| 版本 | 日期 | 作者 | 说明 |
|------|------|------|------|
| v1.0 | 2026-04-03 | 麦克雷 | 初稿：以芯片为中心的评测模块重设计 |
| v2.0 | 2026-04-04 | 麦克雷 | 评测任务全流程 + 模板管理 + DeepLink 对齐 |
| v2.1 | 2026-04-04 | 麦克雷 | 全模块详细设计 + 22个用户故事 + 完整参数定义 |
| v3.0 | 2026-04-04 | 菜菜子 | 评审修改版：补全5大模块、新增计费/编排/错误码 |

> 本文档为自包含的完整产品设计文档，替代 v2.1 及 product-overview-design-v2。

---

# 第一部分：产品定位与目标

## 1.1 一句话定义

**AHVP（AI Hardware Verification Platform）是一个面向 AI 芯片厂商和评测机构的全流程评测验证平台，以芯片为中心，提供从评测任务创建、执行、结果分析到芯片综合评价报告的端到端能力。**

## 1.2 六层评测体系

AHVP 采用六层评测体系，全面衡量 AI 芯片的综合能力：

| 层级 | 评测维度 | 说明 | 阶段 |
|------|----------|------|------|
| L1 | 计算性能 | TOPS/TFLOPS、算力利用率、Peak vs Sustained | ✅ MVP |
| L2 | 访存性能 | 显存带宽、HBM 带宽利用率、Cache 命中率 | ✅ MVP |
| L3 | 通信性能 | 芯片间互联带宽、AllReduce/AllGather 延迟 | 📅 Phase 2 |
| L4 | 算子兼容 | 算子覆盖率、精度对齐（FP16/BF16/INT8）、自定义算子支持 | ✅ MVP |
| L5 | 模型性能 | 端到端模型推理/训练吞吐、首 Token 延迟、生成速度 | ✅ MVP |
| L6 | 生态成熟 | SDK 完整度、文档覆盖率、社区活跃度、工具链成熟度 | 📅 Phase 2 |

## 1.3 分期实现计划

### MVP 阶段：四维评分

MVP 聚焦核心评测能力，采用四维评分体系：

| 维度 | 权重 | 关键指标 |
|------|------|----------|
| 计算性能 | 30% | TOPS/TFLOPS、算力利用率、混合精度性能 |
| 访存性能 | 20% | HBM 带宽、显存带宽利用率、数据搬运效率 |
| 算子兼容 | 25% | 算子覆盖率、精度对齐通过率、回归测试通过率 |
| 模型性能 | 25% | 推理吞吐量、训练吞吐量、首 Token 延迟 |

### Phase 2 阶段：六维评分

在 MVP 基础上扩展通信性能和生态成熟度，形成完整的六维评分体系：

| 维度 | 权重 | 关键指标 |
|------|------|----------|
| 计算性能 | 25% | TOPS/TFLOPS、算力利用率、混合精度性能 |
| 访存性能 | 15% | HBM 带宽、显存带宽利用率、数据搬运效率 |
| 通信性能 | 15% | 芯片间互联带宽、集合通信延迟、RDMA 性能 |
| 算子兼容 | 20% | 算子覆盖率、精度对齐通过率、自定义算子支持 |
| 模型性能 | 15% | 推理吞吐量、训练吞吐量、端到端延迟 |
| 生态成熟 | 10% | SDK 完整度、文档覆盖率、工具链成熟度 |

## 1.4 目标用户

| 用户角色 | 典型场景 |
|----------|----------|
| 评测工程师 | 创建评测任务、执行测试、分析结果 |
| 芯片厂商技术人员 | 查看评测报告、对比竞品、优化性能 |
| 平台管理员 | 管理模板、管理节点、系统运维 |
| 采购决策者 | 查看芯片综合评价报告、对比选型 |

---

# 第二部分：模块1 — 评测系统

## US-1.1: 评测模板浏览与选择

**用户故事：** 作为评测工程师，我需要浏览和筛选平台预置及自定义的评测模板，以便快速找到适合当前评测需求的模板。

### 前置条件

- 用户已登录 AHVP 平台
- 用户拥有"评测工程师"或更高角色权限
- 系统中存在至少 1 个可用评测模板

### 操作步骤

1. 用户进入「评测模板库」页面
2. 系统展示模板列表，支持以下浏览方式：
   - **卡片视图**（默认）：每个模板以卡片形式展示，包含名称、类别标签、评测项数量、创建者、更新时间
   - **列表视图**：表格形式，适合大量模板浏览
3. 用户可通过以下方式筛选模板：
   - **分类筛选**：算子评测 / 模型评测 / 综合评测 / 自定义
   - **标签筛选**：推理、训练、精度、性能、兼容性等
   - **来源筛选**：系统预置 / 用户自定义 / 社区共享（📅 Phase 2）
   - **关键词搜索**：模板名称、描述模糊匹配
4. 用户点击模板卡片查看详情
5. 详情页展示：模板基本信息、评测项列表、参数配置、历史使用记录

### 模板列表字段定义

| 字段 | 标识 | 类型 | 说明 |
|------|------|------|------|
| 模板名称 | `template_name` | String | 模板名称，最大 64 字符 |
| 模板 ID | `template_id` | String(UUID) | 系统自动生成 |
| 分类 | `category` | Enum | `operator` / `model` / `comprehensive` / `custom` |
| 标签 | `tags` | String[] | 标签数组，如 `["inference", "accuracy"]` |
| 来源 | `source` | Enum | `system` / `user` / `community` |
| 评测项数量 | `item_count` | Integer | 该模板包含的评测项数量 |
| 创建者 | `created_by` | String | 创建者用户名 |
| 创建时间 | `created_at` | DateTime | ISO 8601 |
| 更新时间 | `updated_at` | DateTime | ISO 8601 |
| 版本号 | `version` | String | 语义化版本号，如 `1.0.0` |
| 使用次数 | `usage_count` | Integer | 被评测任务引用的次数 |
| 状态 | `status` | Enum | `active` / `deprecated` / `draft` |

### 系统响应

- 模板列表默认按 `updated_at` 降序排列
- 分页参数：`page_size=20`，支持无限滚动加载
- 搜索响应时间 < 500ms
- 系统预置模板标记 🏷️ 图标，不可删除

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 无匹配模板 | 展示空状态页，提示"未找到匹配的评测模板，请尝试调整筛选条件" |
| 模板加载失败 | Toast 提示"模板加载失败，请刷新重试"，错误码 `E-TPL-001` |
| 网络超时 | 展示骨架屏，3 秒后提示重试 |

### 后置条件

- 用户成功浏览模板列表，可选择模板进入详情或创建评测任务

---

## US-1.2: 自定义评测模板创建

**用户故事：** 作为评测工程师，我需要基于空白或已有模板创建自定义评测模板，以满足特定的评测需求。

### 前置条件

- 用户已登录，拥有"评测工程师"或"管理员"角色
- 用户了解需要评测的芯片类型和评测项

### 操作步骤

1. 用户点击「创建模板」按钮，选择创建方式：
   - **空白创建**：从零开始配置
   - **基于已有模板 Fork**：选择一个已有模板作为基础，在副本上修改
2. 填写模板基本信息
3. 配置评测项列表（支持从评测项库中拖拽添加）
4. 为每个评测项配置默认参数
5. 配置模板级别的全局参数（如超时时间、重试策略）
6. 预览模板配置
7. 保存为草稿或直接发布

### 模板基本信息表单

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 模板名称 | `template_name` | String | ✅ | — | 2-64 字符，不可与已有模板重名 |
| 模板描述 | `description` | String | ❌ | — | 最大 500 字符 |
| 分类 | `category` | Enum | ✅ | `custom` | `operator` / `model` / `comprehensive` / `custom` |
| 标签 | `tags` | String[] | ❌ | `[]` | 每个标签 2-20 字符，最多 10 个 |
| 适用芯片类型 | `chip_types` | String[] | ❌ | `["all"]` | 芯片类型枚举值列表 |
| 超时时间 | `timeout_minutes` | Integer | ✅ | `60` | 1-1440 分钟 |
| 重试次数 | `max_retries` | Integer | ✅ | `1` | 0-3 次 |
| 重试间隔 | `retry_interval_sec` | Integer | ✅ | `30` | 10-300 秒 |

### 评测项配置表单

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 评测项名称 | `item_name` | String | ✅ | — | 从评测项库选择或自定义 |
| 评测类型 | `item_type` | Enum | ✅ | — | `accuracy` / `performance` / `compatibility` |
| 执行顺序 | `order` | Integer | ✅ | 自增 | ≥ 1 |
| 依赖项 | `depends_on` | String[] | ❌ | `[]` | 引用同模板内其他评测项 ID |
| 参数覆盖 | `param_overrides` | JSON | ❌ | `{}` | 覆盖评测项默认参数 |
| 是否必选 | `required` | Boolean | ✅ | `true` | — |

### 系统响应

- 保存为草稿：状态设为 `draft`，不出现在模板库公开列表
- 发布模板：状态设为 `active`，版本号 `1.0.0`
- Fork 创建：模板名称自动添加 `(副本)` 后缀，`source` 字段记录原模板 ID
- 保存成功后跳转至模板详情页

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 模板名称重复 | 表单校验提示"模板名称已存在，请修改"，错误码 `E-TPL-010` |
| 评测项为空 | 禁止发布，提示"至少需要添加 1 个评测项" |
| 依赖项循环引用 | 校验拦截，提示"评测项依赖存在循环引用"，错误码 `E-TPL-011` |
| 保存失败 | Toast 提示"保存失败，请重试"，自动保存草稿到本地 localStorage |

### 后置条件

- 模板成功创建并保存，可在模板库中浏览
- 发布的模板可被评测任务引用

---

## US-1.3: 评测模板管理 🆕

**用户故事：** 作为管理员/评测工程师，我需要管理已有模板（编辑、版本管理、Fork、删除、导入/导出），以保持模板库的有序和高质量。

### 前置条件

- 用户已登录，拥有"管理员"角色（全部模板）或"评测工程师"角色（仅自己创建的模板）
- 目标模板存在且状态非 `deleted`

### 操作步骤

#### 模板编辑流程

1. 用户在模板详情页点击「编辑」
2. 系统加载模板当前配置到编辑表单
3. 用户修改模板信息（名称、描述、评测项、参数等）
4. 用户点击「保存」
5. 系统自动递增版本号（Patch 版本 +1，如 `1.0.0` → `1.0.1`）
6. 用户可选择手动指定版本号（用于 Minor/Major 变更）
7. 系统保存新版本，原版本保留在版本历史中

**版本号规则：**

| 变更类型 | 版本递增 | 示例 | 说明 |
|----------|----------|------|------|
| 参数微调 | Patch +1 | `1.0.0` → `1.0.1` | 修改默认参数值、描述文字等 |
| 评测项增减 | Minor +1 | `1.0.1` → `1.1.0` | 添加/删除/重排评测项 |
| 结构性重构 | Major +1 | `1.1.0` → `2.0.0` | 模板分类变更、大量评测项替换 |

#### 版本历史查看与回滚

1. 用户在模板详情页点击「版本历史」Tab
2. 系统展示版本列表，包含：版本号、修改者、修改时间、变更摘要
3. 用户可点击任一历史版本查看快照（只读）
4. 用户可点击「回滚到此版本」，系统确认后创建新版本（内容等于历史版本）

#### 模板 Fork

1. 用户在模板详情页点击「Fork」
2. 系统创建模板副本，名称添加 `(副本)` 后缀
3. 新模板的 `source_template_id` 指向原模板
4. 新模板版本号重置为 `1.0.0`
5. 用户拥有新模板的完全编辑权限

#### 删除保护

1. 用户在模板详情页点击「删除」
2. 系统检查该模板是否被评测计划/任务引用
3. **如有引用**：弹窗提示"该模板被 N 个评测任务引用，无法删除。请先解除引用或改用其他模板"，禁止删除
4. **如无引用**：二次确认弹窗 → 软删除（`status` 设为 `deleted`，数据保留 90 天）

#### JSON 导入/导出

**导出：**
1. 用户在模板详情页点击「导出」→「导出为 JSON」
2. 系统生成标准化 JSON 文件并下载

**导入：**
1. 用户在模板库页面点击「导入模板」
2. 上传 JSON 文件（最大 5MB）
3. 系统校验 JSON 格式和必填字段
4. 预览导入内容，用户确认后导入
5. 导入的模板为 `draft` 状态，需手动发布

**JSON 模板格式示例：**

```json
{
  "schema_version": "1.0",
  "template": {
    "name": "ResNet50 推理精度评测",
    "category": "model",
    "tags": ["inference", "accuracy", "resnet"],
    "timeout_minutes": 120,
    "max_retries": 2,
    "items": [
      {
        "name": "FP16 精度对齐",
        "type": "accuracy",
        "order": 1,
        "params": {
          "dtype": "fp16",
          "abs_threshold": 0.001,
          "rel_threshold": 0.01,
          "reference_device": "NVIDIA A100"
        }
      },
      {
        "name": "INT8 精度对齐",
        "type": "accuracy",
        "order": 2,
        "params": {
          "dtype": "int8",
          "abs_threshold": 1,
          "rel_threshold": 0.05,
          "reference_device": "NVIDIA A100"
        }
      }
    ]
  }
}
```

### 模板管理字段定义

| 字段 | 标识 | 类型 | 说明 |
|------|------|------|------|
| 模板 ID | `template_id` | String(UUID) | 唯一标识 |
| 版本号 | `version` | String | 语义化版本号 |
| 版本历史 | `version_history` | Array | 版本快照数组 |
| 来源模板 | `source_template_id` | String(UUID) | Fork 来源，空表示原创 |
| 引用计数 | `reference_count` | Integer | 被评测任务引用的次数 |
| 是否可删除 | `deletable` | Boolean | 计算字段：`reference_count == 0` |
| 状态 | `status` | Enum | `draft` / `active` / `deprecated` / `deleted` |
| 删除时间 | `deleted_at` | DateTime | 软删除时间戳，90 天后物理清除 |

### 完整 CRUD API 表

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/templates` | 模板列表（分页、筛选、搜索） | 评测工程师+ |
| `GET` | `/api/v1/templates/{id}` | 模板详情 | 评测工程师+ |
| `POST` | `/api/v1/templates` | 创建模板 | 评测工程师+ |
| `PUT` | `/api/v1/templates/{id}` | 更新模板（自动递增版本） | 模板创建者/管理员 |
| `DELETE` | `/api/v1/templates/{id}` | 删除模板（软删除，有引用保护） | 模板创建者/管理员 |
| `POST` | `/api/v1/templates/{id}/fork` | Fork 模板 | 评测工程师+ |
| `GET` | `/api/v1/templates/{id}/versions` | 版本历史列表 | 评测工程师+ |
| `GET` | `/api/v1/templates/{id}/versions/{ver}` | 获取指定版本快照 | 评测工程师+ |
| `POST` | `/api/v1/templates/{id}/rollback` | 回滚到指定版本 | 模板创建者/管理员 |
| `GET` | `/api/v1/templates/{id}/export` | 导出模板 JSON | 评测工程师+ |
| `POST` | `/api/v1/templates/import` | 导入模板 JSON | 评测工程师+ |
| `PATCH` | `/api/v1/templates/{id}/status` | 修改模板状态 | 管理员 |

### 系统响应

- 编辑保存成功：Toast 提示"模板已保存，版本号 X.X.X"
- Fork 成功：跳转至新模板编辑页
- 删除成功：返回模板列表，刷新
- 导出成功：浏览器自动下载 JSON 文件
- 导入成功：跳转至新模板详情页（草稿状态）

### 异常处理

| 异常场景 | 处理方式 | 错误码 |
|----------|----------|--------|
| 编辑已被他人锁定的模板 | 提示"该模板正在被 XXX 编辑，请稍后再试" | `E-TPL-020` |
| 回滚目标版本不存在 | 提示"指定版本不存在" | `E-TPL-021` |
| 删除被引用的模板 | 提示"模板被 N 个任务引用，无法删除" | `E-TPL-022` |
| 导入 JSON 格式错误 | 提示"JSON 格式校验失败：{具体原因}" | `E-TPL-023` |
| 导入 JSON 文件过大 | 提示"文件大小超过 5MB 限制" | `E-TPL-024` |
| 模板 Fork 时原模板被删除 | 提示"原模板已被删除，无法 Fork" | `E-TPL-025` |

### 后置条件

- 模板编辑/Fork/导入后，更新后的模板可正常使用
- 删除的模板不再出现在公开列表，90 天后物理清除
- 版本历史完整记录所有变更

---

## US-1.4: 评测任务创建（6 步向导）

**用户故事：** 作为评测工程师，我需要通过 6 步向导创建评测任务，配置芯片、评测项、参数、节点和执行策略，以启动完整的评测流程。

### 前置条件

- 用户已登录，拥有"评测工程师"或更高角色
- 系统中存在可用的评测模板
- 系统中存在已注册的可用计算节点

### 操作步骤

#### Step 1: 选择芯片

用户选择本次评测的目标芯片。

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 芯片厂商 | `chip_vendor` | Enum/搜索 | ✅ | — | 从已注册芯片库选择 |
| 芯片型号 | `chip_model` | Enum/搜索 | ✅ | — | 联动芯片厂商筛选 |
| 芯片规格 | `chip_spec` | JSON（只读） | — | 自动填充 | 选择芯片后自动展示：显存、算力、接口等 |
| 驱动版本 | `driver_version` | String | ✅ | 最新版本 | 从芯片支持的驱动版本列表选择 |
| SDK 版本 | `sdk_version` | String | ✅ | 最新版本 | 从芯片支持的 SDK 版本列表选择 |

#### Step 2: 选择评测模板

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 评测模板 | `template_id` | String(UUID) | ✅ | — | 从模板库选择 |
| 模板版本 | `template_version` | String | ✅ | 最新版本 | 选择使用的模板版本 |

选择模板后，系统自动加载模板配置的评测项列表到 Step 3。

#### Step 3: 评测项选择树

以树形结构展示模板中的评测项，用户可勾选/取消（非必选项可取消）。

**评测项分类树结构：**

```
📁 算子评测
├── 📁 精度测试
│   ├── ☑️ FP16 精度对齐
│   ├── ☑️ BF16 精度对齐
│   ├── ☑️ INT8 精度对齐
│   └── ☑️ FP32 精度对齐
├── 📁 推理性能测试
│   ├── ☑️ MatMul 推理性能
│   ├── ☑️ Conv2D 推理性能
│   ├── ☑️ Softmax 推理性能
│   └── ☑️ LayerNorm 推理性能
└── 📁 训练性能测试
    ├── ☑️ MatMul 训练性能（含反向传播）
    ├── ☑️ Conv2D 训练性能（含反向传播）
    └── ☑️ 混合精度训练性能
📁 模型评测
├── 📁 推理性能测试
│   ├── ☑️ ResNet50 推理吞吐
│   ├── ☑️ BERT-Base 推理吞吐
│   ├── ☑️ LLaMA-7B 推理性能
│   └── ☑️ Stable Diffusion 推理性能
├── 📁 训练性能测试
│   ├── ☑️ ResNet50 训练吞吐
│   ├── ☑️ BERT-Base 训练吞吐
│   └── ☑️ LLaMA-7B 微调性能（📅 Phase 2）
└── 📁 兼容性测试
    ├── ☑️ ONNX 模型导入
    └── ☑️ PyTorch 模型转换
```

> **注意：** "推理性能测试"与"训练性能测试"在树中明确分开，避免混淆。训练性能测试包含前向+反向传播，推理性能测试仅包含前向。

#### Step 4: 参数配置（5 Tab 页签）

**Tab 1: 通用参数**

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 任务名称 | `task_name` | String | ✅ | `{芯片型号}_{模板名}_{日期}` | 2-128 字符 |
| 任务描述 | `task_description` | String | ❌ | — | 最大 500 字符 |
| 优先级 | `priority` | Enum | ✅ | `normal` | `low` / `normal` / `high` / `urgent` |
| 超时时间 | `timeout_minutes` | Integer | ✅ | 模板值 | 1-1440 分钟 |
| 重试次数 | `max_retries` | Integer | ✅ | 模板值 | 0-3 次 |
| 失败策略 | `failure_strategy` | Enum | ✅ | `continue` | `continue`（继续）/ `stop`（终止） |

**Tab 2: 精度参数**

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| FP16 绝对阈值 | `fp16_abs_threshold` | Float | ✅ | `0.001` | > 0 |
| FP16 相对阈值 | `fp16_rel_threshold` | Float | ✅ | `0.01` | > 0, < 1 |
| BF16 绝对阈值 | `bf16_abs_threshold` | Float | ✅ | `0.01` | > 0 |
| BF16 相对阈值 | `bf16_rel_threshold` | Float | ✅ | `0.02` | > 0, < 1 |
| INT8 绝对阈值 | `int8_abs_threshold` | Float | ✅ | `1` | > 0 |
| INT8 相对阈值 | `int8_rel_threshold` | Float | ✅ | `0.05` | > 0, < 1 |
| FP32 绝对阈值 | `fp32_abs_threshold` | Float | ✅ | `0.0001` | > 0 |
| FP32 相对阈值 | `fp32_rel_threshold` | Float | ✅ | `0.001` | > 0, < 1 |
| 参考设备 | `reference_device` | Enum | ✅ | `NVIDIA A100` | 从参考设备库选择 |

> **v3.0 变更：** 新增 INT8 精度阈值配置（`int8_abs_threshold=1`, `int8_rel_threshold=0.05`），反映 INT8 量化精度损失较大的客观特性。

**Tab 3: 性能参数**

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 预热轮次 | `warmup_iterations` | Integer | ✅ | `10` | 1-100 |
| 测试轮次 | `test_iterations` | Integer | ✅ | `100` | 10-10000 |
| Batch Size | `batch_sizes` | Integer[] | ✅ | `[1, 8, 32]` | 每个值 1-2048 |
| 输入形状 | `input_shapes` | String[] | ❌ | 模板默认值 | 如 `["1x3x224x224"]` |
| 性能指标 | `metrics` | String[] | ✅ | `["throughput", "latency_p50", "latency_p99"]` | 枚举值列表 |

**Tab 4: 模型参数**（仅模型评测时显示）

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 模型来源 | `model_source` | Enum | ✅ | `model_hub` | `model_hub` / `upload` / `url` |
| 模型标识 | `model_id` | String | ✅ | — | Model Hub ID 或 URL |
| 最大序列长度 | `max_seq_length` | Integer | 条件 | `2048` | LLM 类模型必填 |
| 推理框架 | `inference_framework` | Enum | ✅ | `native` | `native` / `onnxruntime` / `tensorrt` / `vllm` |
| 训练框架 | `training_framework` | Enum | 条件 | `pytorch` | 训练评测时必填：`pytorch` / `deepspeed` / `megatron` |

**Tab 5: 高级参数**

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 环境变量 | `env_vars` | KV[] | ❌ | `[]` | Key-Value 列表 |
| 自定义脚本 | `custom_scripts` | Object | ❌ | `null` | 前置/后置脚本配置 |
| 日志级别 | `log_level` | Enum | ✅ | `INFO` | `DEBUG` / `INFO` / `WARN` / `ERROR` |
| 结果保留天数 | `result_retention_days` | Integer | ✅ | `90` | 7-365 |
| 量化方法 | `quantization_method` | Enum | ✅ | `None` | `None` / `GPTQ` / `AWQ` / `SmoothQuant` |
| 量化位数 | `quant_bits` | Enum | 条件 | `16` | `4` / `8` / `16`；`quantization_method != None` 时必填 |
| 量化校准数据集 | `quant_calibration_dataset` | String | 条件 | — | `quantization_method != None` 时可选，指定校准数据集路径 |
| 强制执行开关 | `force_run` | Boolean | ✅ | `false` | 为 `true` 时忽略依赖项 FAIL 状态，强制执行 |

> **v3.0 变更：** 新增量化配置项（`quantization_method`、`quant_bits`、`quant_calibration_dataset`）和 `force_run` 强制执行开关。

#### Step 5: 计算节点选择

详见 US-1.5。

#### Step 6: 确认与提交

确认页展示所有配置的汇总信息，用户确认无误后提交。

**确认页内容：**

| 区域 | 展示内容 |
|------|----------|
| 芯片信息 | 芯片厂商、型号、驱动版本、SDK 版本 |
| 评测模板 | 模板名称、版本号 |
| 评测项 | 已选评测项列表（含数量统计） |
| 参数摘要 | 关键参数概览（精度阈值、Batch Size 等） |
| 计算节点 | 节点名称、资源配置 |
| 计费预估 | 📅 Phase 2：预估计算成本和时间；**MVP：显示"免费评测"标签** |
| 执行策略 | 超时时间、重试策略、失败策略 |

**计费预估区域（MVP 阶段）：**

```
┌─────────────────────────────────────────────┐
│  💰 计费预估                                  │
│                                               │
│  🎉 当前为免费评测阶段                         │
│  预计执行时间：约 45 分钟                      │
│                                               │
│  📅 计费功能将在 Phase 2 上线                  │
└─────────────────────────────────────────────┘
```

### 任务拆分规则

提交评测任务后，系统将任务拆分为多个子任务（SubTask），按评测项粒度执行。

**拆分规则：**

1. 每个勾选的评测项生成 1 个子任务
2. 同一评测项的不同 Batch Size 作为子任务内的多个 run
3. 子任务按评测项 `order` 字段排序执行

**依赖逻辑：**

```
规则：精度 FAIL → 同算子同 dtype 的性能测试自动 SKIP

示例：
  INT8 精度对齐 → FAIL
  ├── INT8 MatMul 推理性能 → SKIP（同算子同dtype，自动跳过）
  ├── INT8 Conv2D 推理性能 → SKIP（同算子同dtype，自动跳过）
  ├── FP16 MatMul 推理性能 → 正常执行（不同dtype，不受影响）
  └── INT8 MatMul 训练性能 → SKIP（同算子同dtype，自动跳过）

例外：
  如果 force_run = true，则忽略上述依赖关系，强制执行所有子任务
```

**依赖关系矩阵：**

| 上游任务类型 | 上游结果 | 下游任务类型 | 默认行为 | force_run=true |
|-------------|---------|-------------|---------|----------------|
| 精度测试 | PASS | 同算子同dtype性能测试 | 正常执行 | 正常执行 |
| 精度测试 | FAIL | 同算子同dtype性能测试 | SKIP | 强制执行 |
| 精度测试 | FAIL | 不同算子/dtype性能测试 | 正常执行 | 正常执行 |
| 精度测试 | ERROR | 同算子同dtype性能测试 | SKIP | 强制执行 |
| 性能测试 | 任意 | 其他性能测试 | 正常执行 | 正常执行 |

### 系统响应

- 提交成功：跳转至任务监控页面，Toast 提示"评测任务已创建，正在排队执行"
- 任务 ID 生成规则：`TASK-{YYYYMMDD}-{6位自增序号}`，如 `TASK-20260404-000001`
- 子任务 ID 生成规则：`{任务ID}-SUB-{3位序号}`，如 `TASK-20260404-000001-SUB-001`

### 异常处理

| 异常场景 | 处理方式 | 错误码 |
|----------|----------|--------|
| 芯片未注册 | Step 1 无法选择，提示联系管理员注册芯片 | `E-TASK-001` |
| 模板版本已废弃 | 提示"该模板版本已废弃，请选择最新版本" | `E-TASK-002` |
| 无可用计算节点 | Step 5 提示"无可用节点，请联系管理员" | `E-TASK-003` |
| 参数校验失败 | 对应 Tab 标红，展示具体错误信息 | `E-TASK-004` |
| 提交时节点被占用 | 进入排队状态，提示预计等待时间 | `E-TASK-005` |
| 量化方法与芯片不兼容 | 提示"该芯片不支持 {method} 量化方法" | `E-TASK-006` |

### 后置条件

- 评测任务创建成功，状态为 `queued`
- 子任务根据拆分规则生成完毕
- 任务进入调度队列，等待计算节点分配

---

## US-1.5: 计算节点选择与资源分配

**用户故事：** 作为评测工程师，我需要在创建评测任务时选择合适的计算节点并配置资源分配策略。

### 前置条件

- 系统中存在已注册且状态正常的计算节点
- 所选芯片已安装在至少一个可用节点上

### 操作步骤

1. 系统根据 Step 1 选择的芯片型号自动筛选兼容节点
2. 展示可用节点列表，包含节点状态和资源使用率
3. 用户选择目标节点（单选或多选）
4. 配置资源分配参数

### 节点列表展示字段

| 字段 | 标识 | 类型 | 说明 |
|------|------|------|------|
| 节点名称 | `node_name` | String | 节点标识名 |
| 节点 ID | `node_id` | String(UUID) | 唯一标识 |
| 芯片型号 | `chip_model` | String | 安装的芯片型号 |
| 芯片数量 | `chip_count` | Integer | 该节点的芯片卡数 |
| 状态 | `status` | Enum | `idle` / `busy` / `offline` / `maintenance` |
| CPU 使用率 | `cpu_usage` | Float | 百分比 |
| 内存使用率 | `memory_usage` | Float | 百分比 |
| 显存使用率 | `gpu_memory_usage` | Float | 百分比 |
| 队列长度 | `queue_length` | Integer | 等待执行的任务数 |
| 预计可用时间 | `estimated_available` | DateTime | 当前任务完成的预计时间 |

### 资源分配参数

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 目标节点 | `target_nodes` | String[] | ✅ | — | 至少选 1 个节点 |
| 芯片卡数 | `gpu_count` | Integer | ✅ | `1` | 1 至节点最大卡数 |
| 独占模式 | `exclusive` | Boolean | ✅ | `false` | 独占节点，其他任务排队 |
| 调度策略 | `scheduling_strategy` | Enum | ✅ | `auto` | `auto`（自动分配）/ `manual`（手动指定）/ `load_balance`（负载均衡，📅 Phase 2） |

### 系统响应

- 节点列表实时刷新（30 秒轮询或 WebSocket 推送）
- `idle` 状态节点高亮显示
- 选择 `busy` 节点时提示预计等待时间
- 独占模式下显示额外确认提示

### 异常处理

| 异常场景 | 处理方式 | 错误码 |
|----------|----------|--------|
| 所选节点突然离线 | 提示"节点已离线，请选择其他节点" | `E-NODE-001` |
| 节点资源不足 | 提示"节点 GPU 显存不足，请减少芯片卡数或选择其他节点" | `E-NODE-002` |
| 无兼容节点 | 提示"没有安装该芯片的可用节点" | `E-NODE-003` |

### 后置条件

- 节点和资源分配配置完成，任务可提交

---

## US-1.6: 评测任务执行与监控

**用户故事：** 作为评测工程师，我需要实时监控评测任务的执行状态、查看子任务进度和日志，以便及时发现和处理异常。

### 前置条件

- 评测任务已创建并进入调度队列
- 用户拥有该任务的查看权限

### 操作步骤

1. 用户进入「任务监控」页面
2. 系统展示任务看板，支持以下视图：
   - **列表视图**（默认）：所有任务列表，按创建时间降序
   - **看板视图**：按状态分列展示（排队中 / 执行中 / 已完成 / 已失败）
3. 用户点击任务进入详情页，查看：
   - **任务概览**：整体进度条、子任务完成比例
   - **子任务列表**：每个子任务的状态、执行时长、资源用量
   - **实时日志**：流式展示当前执行子任务的日志输出
   - **资源监控**：GPU 利用率、显存占用、CPU/内存曲线图
4. 用户可对执行中的任务进行操作：
   - **暂停**：暂停当前子任务，释放资源
   - **恢复**：继续暂停的任务
   - **终止**：取消整个任务，释放所有资源
   - **重试**：对 FAILED 的子任务重新执行

### 任务状态机

```
created → queued → running → completed
                      ↓           ↑
                   paused ────────┘
                      ↓
                   failed → retrying → running
                      ↓
                  cancelled
```

| 状态 | 标识 | 说明 |
|------|------|------|
| 已创建 | `created` | 任务刚创建，尚未进入队列 |
| 排队中 | `queued` | 等待计算节点可用 |
| 执行中 | `running` | 正在执行评测 |
| 已暂停 | `paused` | 用户手动暂停 |
| 已完成 | `completed` | 所有子任务执行完毕 |
| 已失败 | `failed` | 执行出错且重试耗尽 |
| 重试中 | `retrying` | 失败后自动重试 |
| 已取消 | `cancelled` | 用户手动取消 |

### 子任务状态字段

| 字段 | 标识 | 类型 | 说明 |
|------|------|------|------|
| 子任务 ID | `subtask_id` | String | 如 `TASK-20260404-000001-SUB-001` |
| 评测项名称 | `item_name` | String | 评测项名称 |
| 状态 | `status` | Enum | 同任务状态机 + `skipped` |
| 开始时间 | `started_at` | DateTime | 开始执行时间 |
| 结束时间 | `finished_at` | DateTime | 执行完成时间 |
| 执行时长 | `duration_seconds` | Integer | 实际执行秒数 |
| 重试次数 | `retry_count` | Integer | 已重试次数 |
| 跳过原因 | `skip_reason` | String | 仅 `skipped` 状态有值 |
| 日志路径 | `log_path` | String | 日志文件存储路径 |

### 系统响应

- 任务列表分页展示，`page_size=20`
- 实时日志通过 WebSocket 推送，延迟 < 1 秒
- 资源监控数据 5 秒刷新一次
- 子任务状态变更触发页面实时更新

### 异常处理

| 异常场景 | 处理方式 | 错误码 |
|----------|----------|--------|
| 节点执行中断线 | 子任务标记为 `failed`，自动触发重试 | `E-EXEC-001` |
| 执行超时 | 子任务标记为 `failed`，原因记为 `timeout` | `E-EXEC-002` |
| 显存 OOM | 子任务标记为 `failed`，建议减小 Batch Size | `E-EXEC-003` |
| WebSocket 断连 | 自动重连，期间日志缓存后一次性推送 | `E-EXEC-004` |

### 后置条件

- 任务执行完毕后，所有子任务结果已持久化
- 日志文件已归档
- 任务状态更新为 `completed` 或 `failed`

---

## US-1.7: 评测结果查看

**用户故事：** 作为评测工程师，我需要查看评测任务的详细结果，包括每个子任务的指标数据、通过/失败判定和可视化图表。

### 前置条件

- 评测任务状态为 `completed` 或 `failed`（部分子任务有结果）
- 用户拥有该任务的查看权限

### 操作步骤

1. 用户进入任务详情页的「评测结果」Tab
2. 系统展示结果概览卡片：
   - **通过率**：通过子任务数 / 总子任务数
   - **跳过数**：因依赖失败而跳过的子任务数
   - **总耗时**：任务总执行时长
   - **资源消耗**：GPU 时长（卡·小时）
3. 展示子任务结果列表，每个子任务可展开查看：
   - **精度测试结果**：绝对误差、相对误差、是否通过阈值
   - **性能测试结果**：吞吐量、延迟（P50/P99/Max）、资源利用率
   - **详细数据表**：不同 Batch Size 下的指标对比
4. 可视化图表（📅 Phase 2 增强，MVP 提供基础图表）：
   - Batch Size vs Throughput 折线图
   - 延迟分布直方图
   - 精度对比散点图

### 结果数据字段

**精度测试结果：**

| 字段 | 标识 | 类型 | 说明 |
|------|------|------|------|
| 数据类型 | `dtype` | String | `fp16` / `bf16` / `int8` / `fp32` |
| 绝对误差 | `abs_error` | Float | 最大绝对误差 |
| 相对误差 | `rel_error` | Float | 最大相对误差 |
| 绝对阈值 | `abs_threshold` | Float | 判定阈值 |
| 相对阈值 | `rel_threshold` | Float | 判定阈值 |
| 判定结果 | `verdict` | Enum | `PASS` / `FAIL` |
| 匹配率 | `match_rate` | Float | 元素级匹配通过的比例 |

**性能测试结果：**

| 字段 | 标识 | 类型 | 说明 |
|------|------|------|------|
| Batch Size | `batch_size` | Integer | 测试批次大小 |
| 吞吐量 | `throughput` | Float | samples/sec 或 tokens/sec |
| 延迟 P50 | `latency_p50_ms` | Float | 毫秒 |
| 延迟 P99 | `latency_p99_ms` | Float | 毫秒 |
| 延迟 Max | `latency_max_ms` | Float | 毫秒 |
| GPU 利用率 | `gpu_utilization` | Float | 百分比 |
| 显存峰值 | `gpu_memory_peak_mb` | Float | MB |
| 算力利用率 | `compute_utilization` | Float | 百分比（实际/理论峰值） |

### 结果导出

- **CSV 导出**：所有原始指标数据
- **PDF 报告**（📅 Phase 2）：包含图表的格式化报告
- **JSON 导出**：结构化数据，可用于 CI/CD 集成

### 系统响应

- 结果页面加载时间 < 2 秒
- 图表渲染使用 ECharts，支持交互（缩放、Tooltip）
- 大量数据（>1000 条）启用虚拟滚动

### 异常处理

| 异常场景 | 处理方式 | 错误码 |
|----------|----------|--------|
| 结果数据缺失 | 子任务标记为"数据异常"，展示可用数据 | `E-RESULT-001` |
| 导出文件过大 | 分批导出或压缩为 ZIP | `E-RESULT-002` |
| 图表渲染失败 | 降级为纯表格展示 | `E-RESULT-003` |

### 后置条件

- 用户完成结果查看，可基于结果创建芯片评价报告
- 导出数据可用于外部分析

---

## US-1.8: 芯片评价报告生成与查看

**用户故事：** 作为评测工程师/采购决策者，我需要基于评测结果生成芯片综合评价报告，以多维度评分展示芯片能力。

### 前置条件

- 至少有 1 个该芯片的已完成评测任务
- 评测任务覆盖报告所需的评测维度

### 操作步骤

1. 用户进入芯片详情页，点击「生成评价报告」
2. 选择要纳入报告的评测任务（可多选）
3. 选择评分体系：
   - **MVP（四维）**：计算性能 + 访存性能 + 算子兼容 + 模型性能
   - **Phase 2（六维）**：增加通信性能 + 生态成熟度（📅 Phase 2 可用）
4. 系统自动生成评分报告
5. 用户可查看、编辑注释、导出报告

### 评分体系

#### MVP 阶段 — 四维评分

| 维度 | 权重 | 评分来源 | 计算公式 |
|------|------|----------|----------|
| 计算性能 | 30% | 算子性能测试、模型推理/训练吞吐 | `实测TOPS / 理论峰值TOPS × 100` |
| 访存性能 | 20% | HBM 带宽测试、显存带宽利用率测试 | `实测带宽 / 理论峰值带宽 × 100` |
| 算子兼容 | 25% | 精度对齐通过率、算子覆盖率 | `通过算子数 / 总测试算子数 × 100` |
| 模型性能 | 25% | 端到端模型推理/训练性能 | `实测吞吐 / 基准设备吞吐 × 100`（对比 A100） |

**综合评分 = Σ (维度评分 × 权重)**

#### Phase 2 阶段 — 六维评分 📅

| 维度 | 权重 | 评分来源 | 计算公式 |
|------|------|----------|----------|
| 计算性能 | 25% | 算子性能测试、模型推理/训练吞吐 | 同上 |
| 访存性能 | 15% | HBM 带宽测试 | 同上 |
| 通信性能 | 15% | 集合通信测试（AllReduce/AllGather） | `实测通信带宽 / 理论互联带宽 × 100` |
| 算子兼容 | 20% | 精度对齐通过率 | 同上 |
| 模型性能 | 15% | 端到端模型性能 | 同上 |
| 生态成熟 | 10% | SDK 覆盖度、文档质量、社区活跃度 | 人工评估 + 自动化检测综合 |

### 报告内容结构

```
芯片评价报告
├── 1. 报告摘要
│   ├── 芯片基本信息
│   ├── 综合评分（雷达图）
│   └── 一句话总结
├── 2. 评分详情
│   ├── 2.1 计算性能（30%）
│   │   ├── 指标数据表
│   │   └── 与基准对比
│   ├── 2.2 访存性能（20%）
│   ├── 2.3 算子兼容（25%）
│   └── 2.4 模型性能（25%）
├── 3. 对比分析（📅 Phase 2）
│   └── 与其他芯片的雷达图对比
├── 4. 建议与结论
│   ├── 优势总结
│   ├── 待改进项
│   └── 适用场景推荐
└── 附录：原始评测数据
```

### 报告字段定义

| 字段 | 标识 | 类型 | 说明 |
|------|------|------|------|
| 报告 ID | `report_id` | String(UUID) | 唯一标识 |
| 芯片型号 | `chip_model` | String | 被评估芯片 |
| 评分体系 | `scoring_system` | Enum | `four_dimension` / `six_dimension` |
| 综合评分 | `overall_score` | Float | 0-100 |
| 维度评分 | `dimension_scores` | Object | 各维度评分 JSON |
| 评测任务列表 | `task_ids` | String[] | 纳入报告的评测任务 ID |
| 生成时间 | `generated_at` | DateTime | 报告生成时间 |
| 生成者 | `generated_by` | String | 操作者 |
| 状态 | `status` | Enum | `draft` / `published` |

### 评分等级

| 分数区间 | 等级 | 标签颜色 |
|----------|------|----------|
| 90-100 | S（卓越） | 🟢 绿色 |
| 80-89 | A（优秀） | 🔵 蓝色 |
| 70-79 | B（良好） | 🟡 黄色 |
| 60-69 | C（一般） | 🟠 橙色 |
| < 60 | D（待改进） | 🔴 红色 |

### 系统响应

- 报告生成时间 < 10 秒
- 雷达图使用 ECharts 渲染
- PDF 导出支持中英文

### 异常处理

| 异常场景 | 处理方式 | 错误码 |
|----------|----------|--------|
| 评测数据不足 | 提示"评测数据不足以生成完整报告，缺少 {维度} 数据" | `E-REPORT-001` |
| 评分计算异常 | 降级为可生成维度的部分报告，标注"数据不完整" | `E-REPORT-002` |
| PDF 生成失败 | 提供在线查看 + JSON 导出作为替代 | `E-REPORT-003` |

### 后置条件

- 报告生成并保存，可在芯片详情页查看
- 报告可导出为 PDF/JSON
- 报告数据可用于多芯片对比（📅 Phase 2）

---

## US-1.9: 自主编排系统 🆕 📅 Phase 2

**用户故事：** 作为高级评测工程师，我需要通过可视化编排器设计复杂的评测流程（多步骤、条件分支、并行执行），以实现灵活的自动化评测场景。

> ⚠️ 本功能为 📅 Phase 2 实现，MVP 阶段使用 US-1.4 的 6 步向导创建任务。

### 前置条件

- 用户已登录，拥有"高级评测工程师"或"管理员"角色
- 系统中存在可用的评测模板
- 用户熟悉基本的流程编排概念

### 操作步骤

1. 用户进入「编排系统」页面，点击「新建编排」
2. 系统打开可视化流程设计器（拖拽式画布）
3. 用户从左侧面板拖拽节点到画布
4. 用户通过连线连接节点，定义执行流程
5. 用户配置每个节点的参数
6. 用户保存或导出流程

### 节点类型定义

| 节点类型 | 标识 | 图标 | 说明 | 输入/输出 |
|----------|------|------|------|----------|
| 开始节点 | `start` | ▶️ | 流程起点，全局参数配置 | 0输入/1输出 |
| 结束节点 | `end` | ⏹️ | 流程终点，汇总结果 | N输入/0输出 |
| 评测任务节点 | `eval_task` | 🔬 | 执行一个评测任务 | 1输入/1输出 |
| 条件判断节点 | `condition` | ❓ | 根据条件分支执行 | 1输入/N输出 |
| 并行分支节点 | `parallel_fork` | 🔀 | 启动并行执行分支 | 1输入/N输出 |
| 汇聚节点 | `parallel_join` | 🔁 | 等待所有并行分支完成 | N输入/1输出 |
| 脚本节点 | `script` | 📜 | 执行自定义脚本 | 1输入/1输出 |
| 通知节点 | `notify` | 📧 | 发送通知（邮件/钉钉/飞书） | 1输入/1输出 |

### 节点配置

#### 评测任务节点配置

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 节点名称 | `node_name` | String | ✅ | `评测任务_N` | 2-64 字符 |
| 评测模板 | `template_id` | String(UUID) | ✅ | — | 从模板库选择 |
| 参数覆盖 | `param_overrides` | JSON | ❌ | `{}` | 覆盖模板默认参数 |
| 超时时间 | `timeout_minutes` | Integer | ✅ | `60` | 1-1440 |
| 失败策略 | `on_failure` | Enum | ✅ | `stop_flow` | `stop_flow` / `continue` / `retry` |
| 重试次数 | `max_retries` | Integer | ✅ | `1` | 0-3 |

#### 条件判断节点配置

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 节点名称 | `node_name` | String | ✅ | `条件判断_N` | 2-64 字符 |
| 条件表达式 | `condition_expr` | String | ✅ | — | 表达式语法，如 `prev.accuracy_pass_rate >= 0.95` |
| True 分支 | `true_branch` | String | ✅ | — | 连接到的下一个节点 ID |
| False 分支 | `false_branch` | String | ✅ | — | 连接到的下一个节点 ID |

**条件表达式语法：**

```
# 支持的变量
prev.status                    # 上一节点状态: "completed" / "failed"
prev.accuracy_pass_rate        # 精度通过率: 0.0 - 1.0
prev.throughput                # 吞吐量
prev.duration_seconds          # 执行时长
prev.result.{metric_name}     # 任意结果指标

# 支持的操作符
==, !=, >, >=, <, <=, &&, ||, !

# 示例
prev.status == "completed" && prev.accuracy_pass_rate >= 0.95
prev.result.latency_p99_ms < 100
```

#### 并行分支节点配置

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 节点名称 | `node_name` | String | ✅ | `并行分支_N` | 2-64 字符 |
| 分支数 | `branch_count` | Integer | ✅ | `2` | 2-10 |
| 最大并发 | `max_concurrency` | Integer | ✅ | `branch_count` | 1 至分支数 |

#### 脚本节点配置

| 字段 | 标识 | 类型 | 必填 | 默认值 | 校验 |
|------|------|------|------|--------|------|
| 节点名称 | `node_name` | String | ✅ | `脚本_N` | 2-64 字符 |
| 脚本类型 | `script_type` | Enum | ✅ | `python` | `python` / `bash` |
| 脚本内容 | `script_content` | String | ✅ | — | 最大 10KB |
| 超时时间 | `timeout_minutes` | Integer | ✅ | `30` | 1-480 |

### 依赖关系

编排系统支持三种依赖模式：

| 模式 | 说明 | 示例 |
|------|------|------|
| 串行 | 节点依次执行 | `精度测试 → 性能测试 → 报告生成` |
| 并行 | 多个节点同时执行 | `FP16精度 ∥ BF16精度 ∥ INT8精度` |
| 条件分支 | 根据结果选择路径 | `精度通过 ? 执行性能测试 : 终止并通知` |

**典型编排流程示例：**

```
[开始]
  │
  ▼
[精度评测: FP16/BF16/INT8] ──(并行)
  │         │         │
  ▼         ▼         ▼
[FP16精度] [BF16精度] [INT8精度]
  │         │         │
  ▼─────────▼─────────▼
[汇聚：等待全部完成]
  │
  ▼
[条件判断: 精度全部通过?]
  │                    │
  ▼(Yes)              ▼(No)
[性能评测]           [通知: 精度不合格]
  │                    │
  ▼                    ▼
[生成报告]           [结束]
  │
  ▼
[结束]
```

### 流程保存与导出

**流程数据格式（JSON）：**

```json
{
  "flow_id": "FLOW-20260404-000001",
  "flow_name": "标准芯片评测流程",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "node_001",
      "type": "start",
      "name": "开始",
      "position": {"x": 100, "y": 200},
      "config": {
        "chip_vendor": "华为",
        "chip_model": "Ascend 910B"
      }
    },
    {
      "id": "node_002",
      "type": "parallel_fork",
      "name": "并行精度测试",
      "position": {"x": 300, "y": 200},
      "config": {
        "branch_count": 3,
        "max_concurrency": 3
      }
    },
    {
      "id": "node_003",
      "type": "eval_task",
      "name": "FP16 精度测试",
      "position": {"x": 500, "y": 100},
      "config": {
        "template_id": "tpl-fp16-accuracy",
        "param_overrides": {"dtype": "fp16"}
      }
    },
    {
      "id": "node_004",
      "type": "condition",
      "name": "精度全部通过?",
      "position": {"x": 700, "y": 200},
      "config": {
        "condition_expr": "prev.accuracy_pass_rate >= 0.95",
        "true_branch": "node_005",
        "false_branch": "node_006"
      }
    }
  ],
  "edges": [
    {"from": "node_001", "to": "node_002"},
    {"from": "node_002", "to": "node_003", "branch": 0},
    {"from": "node_003", "to": "node_004"}
  ]
}
```

### 编排系统 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/flows` | 编排流程列表 | 高级评测工程师+ |
| `GET` | `/api/v1/flows/{id}` | 流程详情 | 高级评测工程师+ |
| `POST` | `/api/v1/flows` | 创建流程 | 高级评测工程师+ |
| `PUT` | `/api/v1/flows/{id}` | 更新流程 | 流程创建者/管理员 |
| `DELETE` | `/api/v1/flows/{id}` | 删除流程 | 流程创建者/管理员 |
| `POST` | `/api/v1/flows/{id}/execute` | 执行流程 | 高级评测工程师+ |
| `GET` | `/api/v1/flows/{id}/executions` | 流程执行历史 | 高级评测工程师+ |
| `GET` | `/api/v1/flows/{id}/export` | 导出流程 JSON | 高级评测工程师+ |
| `POST` | `/api/v1/flows/import` | 导入流程 JSON | 高级评测工程师+ |

### 系统响应

- 画布支持缩放（50%-200%）、拖拽、自动对齐
- 节点连线支持曲线/直线切换
- 实时校验流程合法性（无悬空节点、无死循环）
- 保存响应时间 < 1 秒

### 异常处理

| 异常场景 | 处理方式 | 错误码 |
|----------|----------|--------|
| 流程存在死循环 | 保存时校验拦截，高亮循环节点 | `E-FLOW-001` |
| 存在悬空节点 | 保存时警告，允许保存为草稿但不可执行 | `E-FLOW-002` |
| 执行中节点超时 | 根据节点 `on_failure` 策略处理 | `E-FLOW-003` |
| 并行分支资源不足 | 降低并发度，串行执行部分分支 | `E-FLOW-004` |
| 条件表达式语法错误 | 节点配置时实时校验，标红提示 | `E-FLOW-005` |

### 后置条件

- 编排流程保存成功，可执行
- 执行历史完整记录每次运行的节点状态和结果
- 流程可导出为 JSON，跨环境共享

---

# 第七部分（片段）：12 个预置评测模板

平台预置 12 个常用评测模板，覆盖算子评测和模型评测的主要场景：

| # | 模板名称 | 分类 | 评测项数 | 说明 |
|---|----------|------|----------|------|
| 1 | 算子精度全量测试 | `operator` | 50+ | 覆盖全部标准算子的 FP16/BF16/INT8/FP32 精度对齐 |
| 2 | 算子性能基准测试 | `operator` | 30+ | 核心算子（MatMul/Conv/Softmax/LayerNorm 等）的推理性能 |
| 3 | 训练算子性能测试 | `operator` | 20+ | 核心算子的训练性能（含反向传播） |
| 4 | 访存带宽测试 | `operator` | 8 | HBM 带宽、显存搬运效率、Cache 命中率 |
| 5 | ResNet50 推理评测 | `model` | 6 | FP16/INT8 精度 + 多 Batch Size 推理吞吐 + 延迟 |
| 6 | ResNet50 训练评测 | `model` | 4 | 混合精度训练吞吐 + 收敛验证 |
| 7 | BERT-Base 推理评测 | `model` | 6 | FP16/INT8 精度 + 不同序列长度推理吞吐 |
| 8 | BERT-Base 训练评测 | `model` | 4 | 混合精度训练吞吐 + 收敛验证 |
| 9 | LLaMA-7B 推理评测 | `model` | 8 | FP16/INT8 精度 + 首 Token 延迟 + 生成吞吐 + KV Cache |
| 10 | LLaMA-7B 训练评测 | `model` | 6 | 全量训练 + LoRA 微调吞吐（📅 Phase 2 扩展） |
| 11 | Stable Diffusion 推理评测 | `model` | 5 | FP16 精度 + 不同分辨率生成速度 |
| 12 | 综合芯片评价套件 | `comprehensive` | 40+ | 组合算子精度 + 性能 + 多模型推理，一站式评价 |

### 模板详细配置

#### 模板 1: 算子精度全量测试

```yaml
name: 算子精度全量测试
category: operator
tags: [accuracy, operator, full-coverage]
timeout_minutes: 240
max_retries: 2
items:
  - name: MatMul FP16 精度
    type: accuracy
    params:
      operator: matmul
      dtype: fp16
      shapes: ["128x128", "512x512", "1024x1024", "2048x2048"]
      abs_threshold: 0.001
      rel_threshold: 0.01
  - name: MatMul BF16 精度
    type: accuracy
    params:
      operator: matmul
      dtype: bf16
      abs_threshold: 0.01
      rel_threshold: 0.02
  - name: MatMul INT8 精度
    type: accuracy
    params:
      operator: matmul
      dtype: int8
      abs_threshold: 1
      rel_threshold: 0.05
  # ... 其余算子类似
```

#### 模板 9: LLaMA-7B 推理评测

```yaml
name: LLaMA-7B 推理评测
category: model
tags: [inference, llm, llama, performance]
timeout_minutes: 360
max_retries: 1
items:
  - name: FP16 精度对齐
    type: accuracy
    params:
      model: llama-7b
      dtype: fp16
      max_seq_length: 2048
      abs_threshold: 0.001
      rel_threshold: 0.01
  - name: INT8 精度对齐
    type: accuracy
    params:
      model: llama-7b
      dtype: int8
      max_seq_length: 2048
      abs_threshold: 1
      rel_threshold: 0.05
  - name: 首 Token 延迟测试
    type: performance
    params:
      model: llama-7b
      metric: first_token_latency
      input_lengths: [128, 512, 1024, 2048]
      batch_sizes: [1, 4, 8]
  - name: 生成吞吐测试
    type: performance
    params:
      model: llama-7b
      metric: generation_throughput
      input_length: 512
      output_length: 256
      batch_sizes: [1, 4, 8, 16]
  - name: KV Cache 效率测试
    type: performance
    params:
      model: llama-7b
      metric: kv_cache_memory
      max_seq_length: [1024, 2048, 4096]
```

#### 模板 12: 综合芯片评价套件

```yaml
name: 综合芯片评价套件
category: comprehensive
tags: [comprehensive, evaluation, scoring]
timeout_minutes: 480
max_retries: 1
items:
  # 计算性能维度
  - name: MatMul 性能基准
    type: performance
    dimension: compute_performance
  - name: Conv2D 性能基准
    type: performance
    dimension: compute_performance
  # 访存性能维度
  - name: HBM 带宽测试
    type: performance
    dimension: memory_performance
  - name: 显存搬运效率
    type: performance
    dimension: memory_performance
  # 算子兼容维度
  - name: 算子精度全量
    type: accuracy
    dimension: operator_compatibility
  # 模型性能维度
  - name: ResNet50 推理
    type: performance
    dimension: model_performance
  - name: BERT-Base 推理
    type: performance
    dimension: model_performance
  - name: LLaMA-7B 推理
    type: performance
    dimension: model_performance
```

---

# 第八部分（片段）：评测参数完整定义

## 6 层参数表

### L1: 计算性能参数

| 参数 | 标识 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| 测试算子列表 | `operator_list` | String[] | 全部标准算子 | 待测试的算子 |
| 数据类型 | `dtypes` | Enum[] | `["fp16", "bf16"]` | `fp32`/`fp16`/`bf16`/`int8`/`int4` |
| 矩阵规模 | `matrix_sizes` | String[] | `["128x128", "512x512", "1024x1024", "2048x2048", "4096x4096"]` | MxK 或 MxKxN |
| 预热轮次 | `warmup_iterations` | Integer | `10` | 预热迭代次数 |
| 测试轮次 | `test_iterations` | Integer | `100` | 正式测试迭代次数 |
| Batch Size | `batch_sizes` | Integer[] | `[1, 8, 32, 64]` | 批次大小列表 |
| 性能指标 | `metrics` | String[] | `["tops", "utilization", "throughput"]` | 采集的性能指标 |

### L2: 访存性能参数

| 参数 | 标识 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| 测试类型 | `memory_test_type` | Enum[] | `["hbm_bandwidth", "device_to_host", "host_to_device"]` | 访存测试类型 |
| 数据块大小 | `block_sizes` | String[] | `["1MB", "16MB", "256MB", "1GB"]` | 传输数据块大小 |
| 测试轮次 | `test_iterations` | Integer | `50` | 正式测试次数 |
| 并发流数 | `num_streams` | Integer | `1` | 并发传输流数量 |

### L3: 通信性能参数 📅 Phase 2

| 参数 | 标识 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| 通信操作 | `collective_ops` | Enum[] | `["all_reduce", "all_gather", "reduce_scatter"]` | 集合通信操作类型 |
| 消息大小 | `message_sizes` | String[] | `["1MB", "64MB", "256MB", "1GB"]` | 通信数据量 |
| 芯片数量 | `num_devices` | Integer[] | `[2, 4, 8]` | 参与通信的芯片数 |
| 后端 | `comm_backend` | Enum | `nccl` | `nccl`/`hccl`/`gloo` |

### L4: 算子兼容参数

| 参数 | 标识 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| 测试算子列表 | `operator_list` | String[] | 全部标准算子 | 待验证的算子 |
| 数据类型 | `dtypes` | Enum[] | `["fp16", "bf16", "int8", "fp32"]` | 精度对齐数据类型 |
| FP16 绝对阈值 | `fp16_abs_threshold` | Float | `0.001` | FP16 精度绝对误差阈值 |
| FP16 相对阈值 | `fp16_rel_threshold` | Float | `0.01` | FP16 精度相对误差阈值 |
| BF16 绝对阈值 | `bf16_abs_threshold` | Float | `0.01` | BF16 精度绝对误差阈值 |
| BF16 相对阈值 | `bf16_rel_threshold` | Float | `0.02` | BF16 精度相对误差阈值 |
| INT8 绝对阈值 | `int8_abs_threshold` | Float | `1` | INT8 精度绝对误差阈值 |
| INT8 相对阈值 | `int8_rel_threshold` | Float | `0.05` | INT8 精度相对误差阈值 |
| FP32 绝对阈值 | `fp32_abs_threshold` | Float | `0.0001` | FP32 精度绝对误差阈值 |
| FP32 相对阈值 | `fp32_rel_threshold` | Float | `0.001` | FP32 精度相对误差阈值 |
| 参考设备 | `reference_device` | String | `NVIDIA A100` | 精度对齐的参考设备 |
| 输入形状 | `input_shapes` | String[] | 算子默认值 | 测试输入的 Tensor 形状 |
| 随机种子 | `random_seed` | Integer | `42` | 随机数种子，保证可复现 |

> **v3.0 变更：** 新增 INT8 精度阈值（`int8_abs_threshold=1`, `int8_rel_threshold=0.05`），反映 INT8 量化场景下精度损失较大的特性，避免误判。

### L5: 模型性能参数

| 参数 | 标识 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| 模型标识 | `model_id` | String | — | 模型 Hub ID 或路径 |
| 推理框架 | `inference_framework` | Enum | `native` | `native`/`onnxruntime`/`tensorrt`/`vllm` |
| 训练框架 | `training_framework` | Enum | `pytorch` | `pytorch`/`deepspeed`/`megatron` |
| Batch Size | `batch_sizes` | Integer[] | `[1, 4, 8, 16, 32]` | 批次大小列表 |
| 最大序列长度 | `max_seq_length` | Integer | `2048` | LLM 最大输入长度 |
| 输出长度 | `output_length` | Integer | `256` | LLM 生成输出长度 |
| 预热轮次 | `warmup_iterations` | Integer | `5` | 预热迭代次数 |
| 测试轮次 | `test_iterations` | Integer | `20` | 正式测试迭代次数 |
| 性能指标 | `metrics` | String[] | `["throughput", "latency_p50", "latency_p99", "first_token_latency"]` | 性能指标 |
| 量化方法 | `quantization_method` | Enum | `None` | `None`/`GPTQ`/`AWQ`/`SmoothQuant` |
| 量化位数 | `quant_bits` | Enum | `16` | `4`/`8`/`16` |
| 量化校准数据集 | `quant_calibration_dataset` | String | — | 校准数据集路径，量化时可选 |

> **v3.0 变更：** 新增量化相关参数（`quantization_method`、`quant_bits`、`quant_calibration_dataset`），支持主流量化方案的评测配置。

### L6: 生态成熟参数 📅 Phase 2

| 参数 | 标识 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| SDK API 覆盖率检测 | `sdk_api_coverage` | Boolean | `true` | 检测 SDK API 覆盖标准 API 的比例 |
| 文档覆盖率检测 | `doc_coverage` | Boolean | `true` | 检测文档对 API 的覆盖率 |
| 示例代码覆盖率 | `example_coverage` | Boolean | `true` | 检测示例代码覆盖率 |
| 社区活跃度 | `community_activity` | Boolean | `false` | 检测 GitHub Star/Issue/PR 等指标 |
| 工具链检测 | `toolchain_check` | Boolean | `true` | 检测 Profiler/Debugger/Compiler 等工具 |

---

> **文档继续见 Part 2（模块2-5）和 Part 3（全局章节：错误码/计费/DeepLink/术语表）**
# AHVP 产品设计文档 v3.0 — 第二部分

> **模块2：评测结果与资产管理 + 模块3：验证平台社区**
> 
> 版本：v3.0 | 作者：菜菜子 | 日期：2026-04-04

---

# 第三部分：模块2 — 评测结果与资产管理

## 模块概述

评测结果与资产管理模块负责评测报告的全生命周期管理（生成→发布→版本→导出→归档），以及平台数字资产（模型、数据集、算子、脚本、流程模板）的统一管理。本模块是连接「评测执行」与「社区生态」的核心桥梁——评测产出的报告经发布流程进入社区公开后，成为榜单排名的数据来源。

---

## US-2.1: 评测报告管理

### 概述

用户完成评测任务后，系统自动生成评测报告。报告支持分级生成（基础版/高级版）、多级发布（草稿→租户内→全平台→社区公开）、版本管理和锁定机制。

### 角色权限矩阵

| 操作 | engineer | tenant_admin | super_admin |
|------|----------|-------------|-------------|
| 创建报告 | ✅ | ✅ | ✅ |
| 编辑草稿 | ✅（仅自己的） | ✅（租户内所有） | ✅（全部） |
| 发布到租户内 | ✅ | ✅ | ✅ |
| 发布到全平台 | ❌ | ✅ | ✅ |
| 发布到社区公开 | ❌ | ❌ | ✅ |
| 72h 内撤回 | ✅（仅自己的） | ✅（租户内所有） | ✅（全部） |
| 超 72h 撤回审批 | ❌ | ✅（租户内） | ✅（全部） |
| 删除报告 | ❌ | ✅（租户内） | ✅（全部） |

### 前置条件

1. 用户已登录且角色为 engineer / tenant_admin / super_admin
2. 至少存在一个已完成（status=completed）的评测任务
3. 评测任务关联的原始数据未被删除

### 操作步骤

#### 步骤 1：查看报告列表

用户进入「评测报告」页面，系统展示当前用户可见范围内的报告列表。

**请求：**
```
GET /api/v1/reports?page=1&page_size=20&status={status}&visibility={visibility}
```

**报告列表字段：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| report_id | string(UUID) | 系统生成 | 报告唯一标识 |
| report_name | string(128) | 是 | 报告名称 |
| task_id | string(UUID) | 系统生成 | 关联评测任务 ID |
| version | integer | 系统生成 | 版本号，从 1 自动递增 |
| tier | enum | 系统生成 | `basic`=基础版, `advanced`=高级版 |
| status | enum | 系统生成 | `draft` / `published` / `withdrawn` / `archived` |
| visibility | enum | 系统生成 | `private` / `tenant` / `platform` / `public` |
| created_by | string(UUID) | 系统生成 | 创建者用户 ID |
| tenant_id | string(UUID) | 系统生成 | 所属租户 ID |
| created_at | datetime | 系统生成 | 创建时间 |
| published_at | datetime | 系统生成 | 发布时间（未发布为 null） |
| locked | boolean | 系统生成 | 是否锁定（发布后自动锁定） |
| parent_version_id | string(UUID) | 系统生成 | 上一版本报告 ID（首版为 null） |

#### 步骤 2：自动生成报告

评测任务完成后，系统自动触发报告生成。

**报告生成分级：**

| 级别 | 名称 | 触发方式 | 费用 | 内容范围 |
|------|------|---------|------|---------|
| basic | 基础版 | 评测完成后自动生成 | 免费 | 评测概要、核心指标得分、算子通过率统计、基本性能对比图表 |
| advanced | 高级版 | 📅 Phase 2 用户手动申请 | 收费 | 含基础版全部内容 + 深度根因分析、性能瓶颈定位、优化建议、行业对标分析 |

**系统响应（自动生成基础版）：**
```json
{
  "code": 0,
  "data": {
    "report_id": "rpt_xxxx",
    "version": 1,
    "tier": "basic",
    "status": "draft",
    "visibility": "private",
    "locked": false,
    "sections": [
      {"type": "summary", "title": "评测概要"},
      {"type": "score", "title": "核心指标得分"},
      {"type": "operator_accuracy", "title": "算子精度通过率"},
      {"type": "performance_chart", "title": "性能对比图表"}
    ]
  }
}
```

#### 步骤 3：编辑报告（草稿状态）

报告处于草稿状态（`status=draft`，`locked=false`）时，有权限的用户可编辑报告标题、备注、自定义标签等元数据字段。评测数据部分由系统生成，不可手动修改。

**请求：**
```
PUT /api/v1/reports/{report_id}
```

**可编辑字段：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| report_name | string(128) | 否 | 报告名称 |
| description | string(1024) | 否 | 报告描述 |
| tags | array[string] | 否 | 自定义标签，最多 10 个 |
| notes | string(2048) | 否 | 补充备注 |

#### 步骤 4：报告发布 🆕

用户根据自身权限选择发布范围。

**请求：**
```
POST /api/v1/reports/{report_id}/publish
```

**请求参数：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| target_visibility | enum | 是 | `tenant` / `platform` / `public` |
| publish_note | string(512) | 否 | 发布说明 |

**发布流程状态机：**

```
draft(private) ──[engineer发布]──→ published(tenant)
                ──[tenant_admin发布]──→ published(platform)
                ──[super_admin发布]──→ published(public)

published(tenant) ──[tenant_admin提升]──→ published(platform)
published(platform) ──[super_admin提升]──→ published(public)
```

**发布约束规则：**

| 规则编号 | 规则描述 |
|---------|---------|
| PUB-01 | 发布后报告自动锁定（`locked=true`），不可再编辑 |
| PUB-02 | engineer 只能发布到 `tenant` 范围 |
| PUB-03 | tenant_admin 可发布/提升到 `platform` 范围 |
| PUB-04 | super_admin 可发布/提升到 `public` 范围 |
| PUB-05 | 可见范围只能提升，不能降级（降级需走撤回流程） |
| PUB-06 | 发布到 `public` 的报告数据将被纳入社区榜单计算 |

**系统响应（发布成功）：**
```json
{
  "code": 0,
  "data": {
    "report_id": "rpt_xxxx",
    "status": "published",
    "visibility": "tenant",
    "locked": true,
    "published_at": "2026-04-04T12:00:00Z",
    "withdraw_deadline": "2026-04-07T12:00:00Z"
  }
}
```

#### 步骤 5：报告撤回 🆕

**请求：**
```
POST /api/v1/reports/{report_id}/withdraw
```

**请求参数：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| reason | string(512) | 是 | 撤回原因 |

**撤回规则：**

| 场景 | 操作者 | 条件 | 流程 |
|------|--------|------|------|
| 72h 内撤回 | 报告创建者 | 发布后 ≤72h | 直接撤回，状态变为 `withdrawn` |
| 72h 内撤回 | tenant_admin | 租户内报告，发布后 ≤72h | 直接撤回 |
| 超 72h 撤回 | 任何人 | 发布后 >72h | 提交撤回申请，需上级 admin 审批 |
| 超 72h 审批 | tenant_admin | 租户内 `tenant`/`platform` 报告 | 审批通过后撤回 |
| 超 72h 审批 | super_admin | 任意报告 | 审批通过后撤回 |

**撤回后处理：**
- 报告状态变为 `withdrawn`，原可见范围降为 `private`
- 若报告数据已纳入榜单，下一次榜单刷新时自动剔除
- 撤回操作记录审计日志
- 报告解除锁定（`locked=false`），可重新编辑后再发布

#### 步骤 6：报告版本管理

**创建新版本：**
```
POST /api/v1/reports/{report_id}/versions
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| base_version | integer | 否 | 基于哪个版本创建（默认最新版） |
| reason | string(512) | 否 | 新版本说明 |

**版本管理规则：**
- 版本号从 1 开始自动递增（v1, v2, v3...）
- 每个版本独立拥有 status、visibility、locked 状态
- 新版本创建时自动继承上一版本的评测数据快照
- 旧版本保持已发布状态不受影响

**版本对比：**
```
GET /api/v1/reports/{report_id}/versions/diff?v1=1&v2=3
```

**返回差异内容：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| added_sections | array | 新增的报告章节 |
| removed_sections | array | 删除的报告章节 |
| modified_metrics | array | 数值变化的指标（含 before/after） |
| metadata_changes | object | 元数据变化（标题、标签等） |

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 403 | 无发布权限 | 提示「您的角色无权发布到该范围，请联系管理员」 |
| 409 | 报告已锁定，尝试编辑 | 提示「报告已发布并锁定，请创建新版本进行修改」 |
| 409 | 重复发布 | 提示「报告已处于发布状态」 |
| 422 | 超 72h 撤回无审批权限 | 提示「发布已超过 72 小时，撤回需管理员审批」，自动创建审批工单 |
| 404 | 报告不存在或无权查看 | 提示「报告不存在或您无权访问」 |

### 后置条件

1. 报告发布后自动锁定，状态为 `published`
2. 发布到 `public` 的报告数据进入榜单计算队列
3. 所有发布/撤回操作记录到审计日志
4. 版本创建记录完整的版本链（parent_version_id）

---

## US-2.2: 多报告对比分析

### 概述

用户选择 2~5 份评测报告进行横向对比分析，系统自动提取关键指标并生成对比视图，帮助用户快速识别不同芯片/不同配置下的性能差异。

### 前置条件

1. 用户已登录
2. 用户对所选报告均有查看权限
3. 所选报告状态为 `published` 或 `draft`（仅自己的草稿）
4. 所选报告数量 ≥ 2 且 ≤ 5

### 操作步骤

#### 步骤 1：选择对比报告

用户在报告列表页勾选多份报告，点击「对比分析」按钮。

**请求：**
```
POST /api/v1/reports/compare
```

**请求参数：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| report_ids | array[string(UUID)] | 是 | 对比报告 ID 列表，2~5 个 |
| dimensions | array[enum] | 否 | 指定对比维度，默认全部。可选：`performance` / `accuracy` / `power` / `compatibility` |

#### 步骤 2：查看对比结果

**系统响应：**
```json
{
  "code": 0,
  "data": {
    "compare_id": "cmp_xxxx",
    "reports": [
      {
        "report_id": "rpt_001",
        "report_name": "芯片A 评测报告 v2",
        "chip_name": "XPU-A100",
        "task_type": "full_benchmark"
      }
    ],
    "dimensions": {
      "performance": {
        "fp16_tflops": [120.5, 98.3, 110.2],
        "inference_qps": [1520, 1280, 1450],
        "latency_p99_ms": [12.3, 15.8, 13.1]
      },
      "accuracy": {
        "operator_pass_rate": [0.95, 0.88, 0.92],
        "model_accuracy_diff": [0.001, 0.003, 0.002]
      },
      "power": {
        "tflops_per_watt": [0.48, 0.39, 0.44],
        "peak_power_w": [250, 250, 250]
      },
      "compatibility": {
        "supported_operators": [1250, 1100, 1200],
        "supported_models": [45, 38, 42]
      }
    },
    "charts": [
      {"type": "radar", "title": "综合能力雷达图"},
      {"type": "bar", "title": "性能对比柱状图"},
      {"type": "table", "title": "详细指标对比表"}
    ]
  }
}
```

#### 步骤 3：保存/导出对比结果

用户可将对比结果保存为「对比快照」或直接导出。

**保存请求：**
```
POST /api/v1/reports/compare/{compare_id}/save
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string(128) | 是 | 对比快照名称 |
| description | string(512) | 否 | 描述 |

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 400 | 报告数量不在 2~5 范围 | 提示「请选择 2 到 5 份报告进行对比」 |
| 403 | 无权查看某份报告 | 提示「您无权查看报告 {report_name}，请移除后重试」 |
| 422 | 报告评测类型不兼容 | 提示「所选报告的评测类型差异过大，部分维度无法对比」，仅展示可对比维度 |

### 后置条件

1. 对比结果临时缓存 24 小时（未保存的自动清理）
2. 已保存的对比快照持久化存储，关联用户 ID

---

## US-2.3: 报告导出

### 概述

用户可将评测报告导出为 PDF、Excel 或 DeepLink 数据收集表格式，满足不同场景的使用需求。DeepLink 格式专为与 DeepLink 数据采集系统对接设计，支持自动映射评测结果到标准化数据收集表。

### 前置条件

1. 用户已登录且对目标报告有查看权限
2. 目标报告状态为 `draft` 或 `published`

### 操作步骤

#### 步骤 1：选择导出格式

用户在报告详情页点击「导出」按钮，选择导出格式。

**请求：**
```
POST /api/v1/reports/{report_id}/export
```

**请求参数：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| format | enum | 是 | `pdf` / `excel` / `deeplink` |
| sections | array[string] | 否 | 指定导出章节（默认全部） |
| include_charts | boolean | 否 | 是否包含图表（PDF 默认 true，其他默认 false） |
| deeplink_template | string | 否 | DeepLink 模板名称（format=deeplink 时必填） |

#### 步骤 2：导出格式说明

**三种导出格式对比：**

| 格式 | 文件类型 | 适用场景 | 包含内容 |
|------|---------|---------|---------|
| PDF | .pdf | 正式报告分享、存档、打印 | 完整报告含图表、封面、目录 |
| Excel | .xlsx | 数据二次分析、自定义图表 | 原始数据表格、多 Sheet 分维度 |
| DeepLink | .zip（含多 .csv） | 对接 DeepLink 数据收集系统 | 标准化 CSV 数据收集表 |

#### 步骤 3：DeepLink 格式映射关系 🆕

DeepLink 导出将 AHVP 评测结果自动映射为 DeepLink 标准数据收集表格式：

**映射表：**

| AHVP 评测模块 | DeepLink 数据收集表 | 文件名 | 关键字段映射 |
|--------------|-------------------|--------|-------------|
| 算子精度评测（GEMM FP16） | GEMM 精度数据表 | `gemm_f16.csv` | operator_name → op_name, accuracy → pass_rate, latency → avg_time_ms |
| 算子精度评测（GEMM INT8） | GEMM 精度数据表 | `gemm_int8.csv` | 同上 |
| 算子精度评测（Conv2D） | Conv 精度数据表 | `conv2d.csv` | operator_name → op_name, input_shape → tensor_shape, accuracy → max_diff |
| 模型推理性能 | 推理性能数据表 | `inference_perf.csv` | model_name → model, batch_size → bs, qps → throughput, latency_p99 → p99_ms |
| 算力基准测试 | 算力基准数据表 | `compute_bench.csv` | dtype → precision, tflops → peak_tflops, utilization → gpu_util |
| 能效评测 | 能效数据表 | `power_efficiency.csv` | power_w → tdp, tflops_per_watt → efficiency |

**DeepLink CSV 示例（gemm_f16.csv）：**
```csv
op_name,input_m,input_n,input_k,pass_rate,max_diff,avg_time_ms,device
gemm_fp16,1024,1024,1024,0.9998,0.0012,1.23,XPU-A100
gemm_fp16,2048,2048,2048,0.9995,0.0018,4.56,XPU-A100
```

#### 步骤 4：下载导出文件

**系统响应（导出任务创建）：**
```json
{
  "code": 0,
  "data": {
    "export_id": "exp_xxxx",
    "format": "deeplink",
    "status": "processing",
    "estimated_time_seconds": 30
  }
}
```

导出完成后通过 WebSocket 推送通知或轮询获取下载链接：
```
GET /api/v1/reports/exports/{export_id}
```

**系统响应（导出完成）：**
```json
{
  "code": 0,
  "data": {
    "export_id": "exp_xxxx",
    "status": "completed",
    "download_url": "https://ahvp.com/exports/exp_xxxx/download",
    "file_size_bytes": 102400,
    "expires_at": "2026-04-11T12:00:00Z"
  }
}
```

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 400 | DeepLink 格式未指定模板 | 提示「请选择 DeepLink 数据收集表模板」 |
| 404 | 报告不存在 | 提示「报告不存在或已删除」 |
| 422 | 报告数据不完整无法导出 | 提示「报告数据不完整，部分章节将为空」，允许继续 |
| 500 | 导出生成失败 | 提示「导出失败，请稍后重试」，记录错误日志 |
| 410 | 下载链接已过期 | 提示「下载链接已过期（7天），请重新导出」 |

### 后置条件

1. 导出文件存储在临时存储区，7 天后自动清理
2. 导出操作记录审计日志（含导出格式、操作人、时间）
3. DeepLink 格式导出自动校验 CSV 格式合规性

---

## US-2.4: 数字资产管理

### 概述

平台提供统一的数字资产管理能力，涵盖模型、数据集、算子、脚本、流程模板五大类资产的上传、版本管理、分享、检索和清理。数字资产是用户在评测过程中积累的核心知识财产，平台确保资产安全、可追溯、可复用。

### 前置条件

1. 用户已登录
2. 用户所属租户已分配存储配额（默认每租户 50GB，📅 Phase 2 支持扩容计费）
3. 对于资产修改/删除操作，用户需具备相应权限

### 操作步骤

#### 步骤 1：资产分类体系

**五大资产类型：**

| 资产类型 | type 枚举值 | 说明 | 支持格式 | 单文件大小上限 |
|---------|------------|------|---------|-------------|
| 模型 | `model` | 预训练模型、微调模型、量化模型 | .onnx, .pt, .safetensors, .bin | 10GB |
| 数据集 | `dataset` | 评测数据集、标注数据、基准数据 | .csv, .json, .parquet, .tar.gz | 5GB |
| 算子 | `operator` | 自定义算子、算子库、算子配置 | .py, .cpp, .so, .json | 500MB |
| 脚本 | `script` | 评测脚本、自动化脚本、工具脚本 | .py, .sh, .yaml, .toml | 50MB |
| 流程模板 | `template` | 评测流程模板、配置模板 | .yaml, .json | 10MB |

#### 步骤 2：上传资产

**请求：**
```
POST /api/v1/assets
Content-Type: multipart/form-data
```

**表单字段定义：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string(128) | 是 | 资产名称 |
| type | enum | 是 | `model` / `dataset` / `operator` / `script` / `template` |
| description | string(2048) | 否 | 资产描述 |
| tags | array[string] | 否 | 标签，最多 20 个 |
| file | binary | 是 | 资产文件（支持分片上传 > 100MB） |
| version_note | string(512) | 否 | 版本说明（首版默认 "v1.0 初始版本"） |
| share_scope | enum | 否 | `personal`（默认）/ `team` / `platform` |
| metadata | object | 否 | 扩展元数据（如模型的 framework、数据集的 sample_count 等） |

**系统响应：**
```json
{
  "code": 0,
  "data": {
    "asset_id": "ast_xxxx",
    "name": "ResNet50 推理模型",
    "type": "model",
    "version": "v1.0",
    "version_id": "ver_xxxx",
    "size_bytes": 102400000,
    "share_scope": "personal",
    "storage_path": "tenants/{tenant_id}/assets/{asset_id}/v1.0/",
    "created_at": "2026-04-04T12:00:00Z"
  }
}
```

#### 步骤 3：资产版本管理

**上传新版本：**
```
POST /api/v1/assets/{asset_id}/versions
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | binary | 是 | 新版本文件 |
| version_note | string(512) | 是 | 版本说明 |
| breaking_change | boolean | 否 | 是否存在不兼容变更，默认 false |

**版本管理能力：**

| 能力 | 说明 | API |
|------|------|-----|
| 版本追溯 | 查看资产全部历史版本列表 | `GET /api/v1/assets/{asset_id}/versions` |
| 版本回滚 | 将资产当前版本指针切换到历史版本 | `POST /api/v1/assets/{asset_id}/versions/{version_id}/rollback` |
| 版本锁定 | 锁定某版本防止被回滚或删除 | `PUT /api/v1/assets/{asset_id}/versions/{version_id}/lock` |
| 版本对比 | 对比两个版本的元数据差异 | `GET /api/v1/assets/{asset_id}/versions/diff?v1={id}&v2={id}` |

**版本规则：**
- 版本号格式：v{major}.{minor}，小版本自动递增，不兼容变更递增大版本
- 每个资产最多保留 50 个版本（超出时提示清理旧版本）
- 已锁定的版本不可删除、不可覆盖

#### 步骤 4：资产分享

**修改分享范围：**
```
PUT /api/v1/assets/{asset_id}/sharing
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| share_scope | enum | 是 | `personal` / `team` / `platform` |
| team_ids | array[string] | 条件必填 | share_scope=team 时，指定分享的团队 ID 列表 |
| permissions | enum | 否 | `view`（默认）/ `download` / `fork` |

**分享范围与权限矩阵：**

| 分享范围 | 可见人群 | 可查看 | 可下载 | 可 Fork |
|---------|---------|--------|--------|---------|
| personal | 仅创建者 | ✅ | ✅ | ✅ |
| team | 指定团队成员 | ✅ | 按权限 | 按权限 |
| platform | 全平台登录用户 | ✅ | 按权限 | 按权限 |

#### 步骤 5：资产检索

**请求：**
```
GET /api/v1/assets?keyword={keyword}&type={type}&tags={tags}&sort={sort}&page=1&page_size=20
```

| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 模糊搜索（名称、描述） |
| type | enum | 按资产类型过滤 |
| tags | string | 按标签过滤（逗号分隔） |
| share_scope | enum | 按分享范围过滤 |
| sort | enum | `created_at` / `updated_at` / `downloads` / `name` |
| created_by | string(UUID) | 按创建者过滤 |

#### 步骤 6：资产清理

**删除资产（移入回收站）：**
```
DELETE /api/v1/assets/{asset_id}
```

**回收站规则：**

| 规则 | 说明 |
|------|------|
| 保留期 | 删除后移入回收站，保留 30 天 |
| 恢复 | 30 天内可从回收站恢复：`POST /api/v1/trash/assets/{asset_id}/restore` |
| 永久删除 | 30 天后自动永久删除，释放存储空间 |
| 手动永久删除 | tenant_admin 可手动清空回收站：`DELETE /api/v1/trash/assets/{asset_id}/purge` |

**存储监控告警：**

| 告警级别 | 触发条件 | 通知方式 |
|---------|---------|---------|
| warning | 租户存储使用率 ≥ 80% | 站内通知 + 邮件 |
| critical | 租户存储使用率 ≥ 95% | 站内通知 + 邮件 + 禁止上传新资产 |
| info | 单个资产版本数 ≥ 40 | 站内通知（建议清理旧版本） |

**📅 Phase 2：资产存储计费**
- 基础配额：每租户 50GB 免费
- 超出部分：按 ¥0.12/GB/月 计费
- 计费周期：月结，每月 1 日出账
- 支持购买存储包（100GB/500GB/1TB）

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 400 | 文件格式不在允许列表 | 提示「不支持的文件格式，{type} 类型资产支持：{formats}」 |
| 413 | 文件超过大小上限 | 提示「文件大小超过 {limit}，请压缩后重试」 |
| 507 | 租户存储配额已满 | 提示「存储空间不足，请清理不需要的资产或联系管理员扩容」 |
| 409 | 尝试修改已锁定版本 | 提示「该版本已锁定，无法修改或删除」 |
| 403 | 无权操作他人资产 | 提示「您无权操作该资产」 |

### 后置条件

1. 资产上传后自动扫描病毒/恶意代码（异步，结果更新到 asset.scan_status）
2. 所有操作记录审计日志
3. 存储使用量实时更新到租户配额表
4. 被引用的资产（关联评测任务）删除时提示「该资产正在被 N 个评测任务引用」

---

## US-2.5: 评测日志管理

### 概述

评测过程中产生的运行日志、调试日志、错误日志统一管理，支持实时查看、检索、下载。所有日志采用加密存储，确保数据安全合规。

### 前置条件

1. 用户已登录且对目标评测任务有查看权限
2. 评测任务处于 `running`、`completed`、`failed` 状态

### 操作步骤

#### 步骤 1：查看日志列表

**请求：**
```
GET /api/v1/tasks/{task_id}/logs?level={level}&keyword={keyword}&start_time={start}&end_time={end}&page=1&page_size=100
```

**日志字段定义：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| log_id | string(UUID) | 日志条目唯一标识 |
| task_id | string(UUID) | 所属评测任务 |
| timestamp | datetime | 日志产生时间（精确到毫秒） |
| level | enum | `DEBUG` / `INFO` / `WARN` / `ERROR` / `FATAL` |
| module | string | 产生日志的模块名 |
| message | string | 日志内容 |
| context | object | 结构化上下文（如 operator_name, batch_size 等） |
| trace_id | string | 分布式追踪 ID |

#### 步骤 2：实时日志流

评测任务运行中时，支持 WebSocket 实时查看日志流：

```
WS /api/v1/tasks/{task_id}/logs/stream?level=INFO
```

#### 步骤 3：日志下载

**请求：**
```
POST /api/v1/tasks/{task_id}/logs/export
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| format | enum | 否 | `json`（默认）/ `csv` / `txt` |
| level | enum | 否 | 最低日志级别过滤 |
| start_time | datetime | 否 | 起始时间 |
| end_time | datetime | 否 | 结束时间 |

#### 步骤 4：数据安全措施 🆕

**日志加密存储：**

| 安全措施 | 实现方式 | 说明 |
|---------|---------|------|
| 存储加密 | AES-256-GCM | 日志文件落盘前自动加密，密钥由 KMS 管理 |
| 传输加密 | TLS 1.3 | API 通信全链路加密 |
| 密钥轮换 | 每 90 天自动轮换 | 旧密钥保留用于解密历史数据 |
| 敏感数据脱敏 | 正则匹配自动脱敏 | IP、Token、密码等字段自动替换为 `***` |

**数据访问控制（租户隔离）：**

| 控制层 | 实现方式 | 说明 |
|--------|---------|------|
| 行级隔离 | tenant_id 强制过滤 | 所有日志查询自动注入 `WHERE tenant_id = {current_tenant}` |
| API 鉴权 | JWT + RBAC | 每次请求验证用户身份和权限 |
| 跨租户防护 | 参数签名校验 | 防止篡改 task_id 访问其他租户日志 |
| 审计追踪 | 操作审计日志 | 记录谁在什么时间访问了哪些日志 |

**合规审计日志保留策略：**

| 日志类型 | 保留时间 | 存储方式 | 说明 |
|---------|---------|---------|------|
| 评测运行日志 | 180 天 | 热存储（前 30 天）+ 冷存储（后 150 天） | 超期自动归档到对象存储 |
| 操作审计日志 | 3 年（1095 天） | 热存储（前 90 天）+ 冷存储 | 满足合规审计要求 |
| 安全事件日志 | 5 年 | 冷存储，不可篡改 | 安全事件调查追溯 |
| 登录日志 | 3 年 | 冷存储 | 合规要求 |

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 403 | 跨租户访问日志 | 提示「无权访问该任务日志」，记录安全事件日志 |
| 404 | 任务不存在或日志已归档 | 提示「日志不存在」或「日志已归档，请联系管理员恢复」 |
| 429 | 日志查询频率过高 | 提示「请求过于频繁，请稍后重试」，限流：100 次/分钟 |
| 503 | 日志服务不可用 | 提示「日志服务暂时不可用，请稍后重试」 |

### 后置条件

1. 日志数据按保留策略自动归档和清理
2. 日志访问操作本身记录到审计日志（防止日志窥探）
3. 敏感数据在日志采集阶段即完成脱敏，存储层不含明文敏感信息
4. 定期（每月）生成合规审计报告，供租户管理员查看

---

# 第四部分：模块3 — 验证平台社区

## 模块概述

验证平台社区是 AHVP 平台的**唯一生态流量入口**，定位为纯公益免费的开放社区。社区整合评测榜单、免费资源下载、技术内容交流、需求对接等功能，构建 AI 芯片生态的中立交流平台。

**核心定位：**
- 🆓 完全免费，不收取任何费用
- 🌐 无需登录即可浏览榜单和公开内容
- 🤝 连接芯片厂商、算法开发者、应用方的桥梁
- 📊 基于真实评测数据的客观排名
- 🔄 形成「评测→发布→榜单→社区→用户增长→更多评测」的正向飞轮

---

## US-3.1: 评测榜单

### 概述

评测榜单基于平台上所有状态为「社区公开」的评测报告数据，自动计算芯片排名并公开展示。提供综合榜、算力榜、推理性能榜、能效榜、算子兼容榜五类榜单，每日自动刷新。

### 前置条件

1. 至少存在 1 条 `visibility=public` 且 `status=published` 的评测报告
2. 榜单数据定时任务正常运行（每日 02:00 AM UTC+8 执行）

### 操作步骤

#### 步骤 1：浏览榜单（无需登录）

用户访问社区首页或直接访问榜单页面。

**请求：**
```
GET /api/v1/community/leaderboards?type={type}&page=1&page_size=50
```

**请求参数：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| type | enum | 否 | 榜单类型（默认 `comprehensive`）：`comprehensive` / `compute` / `inference` / `efficiency` / `compatibility` |
| chip_category | enum | 否 | 芯片类别过滤：`gpu` / `npu` / `dsp` / `all`（默认） |
| time_range | enum | 否 | 时间范围：`all_time`（默认）/ `last_30d` / `last_90d` |
| page | integer | 否 | 页码，默认 1 |
| page_size | integer | 否 | 每页条数，默认 50，最大 100 |

#### 步骤 2：榜单类型与排名算法 🆕

**五类榜单定义：**

| 榜单类型 | 枚举值 | 排名算法 | 说明 |
|---------|--------|---------|------|
| 综合榜 | `comprehensive` | 芯片综合评分降序 | 综合评分 = 算力×0.3 + 推理性能×0.25 + 能效×0.2 + 算子兼容×0.15 + 稳定性×0.1 |
| 算力榜 | `compute` | FP16 TFLOPS 降序 | 取该芯片所有公开报告中 FP16 TFLOPS 的最高值 |
| 推理性能榜 | `inference` | 模型推理 QPS 加权均值降序 | 加权规则：ResNet50 权重 0.2、BERT 权重 0.3、LLaMA-7B 权重 0.3、Stable Diffusion 权重 0.2 |
| 能效榜 | `efficiency` | TFLOPS/W 降序 | 取该芯片最优 TFLOPS/W 值 |
| 算子兼容榜 | `compatibility` | 算子精度通过率降序 | 通过率 = 精度达标算子数 / 总测试算子数 |

**综合评分计算公式：**
```
comprehensive_score = (
    normalize(fp16_tflops) * 0.30 +
    normalize(inference_qps_weighted) * 0.25 +
    normalize(tflops_per_watt) * 0.20 +
    normalize(operator_pass_rate) * 0.15 +
    normalize(stability_score) * 0.10
) * 100
```

其中 `normalize(x) = (x - min) / (max - min)`，基于当前所有参与排名芯片的数据范围归一化到 [0, 1]。

**数据聚合规则：**
- 同一芯片型号有多份公开报告时，取各指标的**最优值**
- 仅纳入 `visibility=public` 且 `status=published` 的报告数据
- 报告被撤回后，下一次刷新自动剔除

#### 步骤 3：查看榜单详情

**系统响应：**
```json
{
  "code": 0,
  "data": {
    "type": "comprehensive",
    "updated_at": "2026-04-04T02:00:00+08:00",
    "next_update_at": "2026-04-05T02:00:00+08:00",
    "total_chips": 42,
    "rankings": [
      {
        "rank": 1,
        "chip_name": "XPU-A100",
        "vendor": "厂商A",
        "comprehensive_score": 92.5,
        "fp16_tflops": 150.2,
        "inference_qps_weighted": 1850.0,
        "tflops_per_watt": 0.60,
        "operator_pass_rate": 0.97,
        "stability_score": 0.99,
        "report_count": 5,
        "latest_report_id": "rpt_xxxx",
        "rank_change": 0
      },
      {
        "rank": 2,
        "chip_name": "NPU-B200",
        "vendor": "厂商B",
        "comprehensive_score": 88.3,
        "rank_change": 2
      }
    ]
  }
}
```

#### 步骤 4：榜单数据刷新

**刷新规则：**

| 配置项 | 值 | 说明 |
|--------|---|------|
| 刷新频率 | 每日凌晨 02:00 AM (UTC+8) | 定时任务自动执行 |
| 刷新范围 | 全部五类榜单 | 一次性重新计算 |
| 增量来源 | 前一日新增/修改/撤回的 public 报告 | 增量触发全量重算 |
| 历史快照 | 每次刷新保存榜单快照 | 支持查看历史排名变化 |
| 手动刷新 | super_admin 可触发手动刷新 | `POST /api/v1/admin/leaderboards/refresh` |

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 200（空数据） | 该榜单类别暂无数据 | 展示「暂无排名数据，欢迎提交评测报告」 |
| 503 | 榜单刷新中 | 展示上一次刷新的数据 + 提示「榜单数据更新中，当前展示截至 {updated_at} 的数据」 |
| 500 | 刷新任务失败 | 保留上一次数据，告警运维团队 |

### 后置条件

1. 榜单数据缓存在 CDN，无需登录即可高速访问
2. 每次刷新生成榜单变化日报（哪些芯片排名变动）
3. 榜单数据通过 Open API 对外开放（只读）

---

## US-3.2: 免费资源下载

### 概述

社区提供免费的评测工具、基准数据集、参考脚本等资源下载，降低 AI 芯片评测门槛，吸引更多用户加入平台生态。

### 前置条件

1. 无需登录即可浏览资源列表
2. 下载需要登录（用于统计和限速控制）

### 操作步骤

#### 步骤 1：浏览资源列表

**请求：**
```
GET /api/v1/community/resources?category={category}&keyword={keyword}&page=1&page_size=20
```

**请求参数：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| category | enum | 否 | `tool` / `dataset` / `script` / `document` / `all`（默认） |
| keyword | string | 否 | 关键词搜索 |
| sort | enum | 否 | `downloads`（默认）/ `newest` / `name` |

**资源字段定义：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| resource_id | string(UUID) | 资源唯一标识 |
| name | string(128) | 资源名称 |
| category | enum | 资源分类 |
| description | string(2048) | 资源描述 |
| version | string | 资源版本号 |
| file_size_bytes | integer | 文件大小 |
| download_count | integer | 累计下载次数 |
| uploaded_by | string | 上传者（平台官方 / 社区用户） |
| uploaded_at | datetime | 上传时间 |
| license | string | 开源协议（如 Apache-2.0, MIT） |
| tags | array[string] | 标签 |

#### 步骤 2：下载资源

**请求（需登录）：**
```
POST /api/v1/community/resources/{resource_id}/download
```

**系统响应：**
```json
{
  "code": 0,
  "data": {
    "download_url": "https://cdn.ahvp.com/resources/{resource_id}/{filename}",
    "expires_at": "2026-04-04T13:00:00Z",
    "file_size_bytes": 52428800
  }
}
```

**下载限制：**

| 限制项 | 值 | 说明 |
|--------|---|------|
| 单日下载次数 | 50 次/用户 | 防止批量爬取 |
| 单文件大小 | 无限制 | CDN 分发 |
| 并发下载 | 3 个/用户 | 带宽公平 |

#### 步骤 3：上传社区资源（登录用户）

**请求：**
```
POST /api/v1/community/resources
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string(128) | 是 | 资源名称 |
| category | enum | 是 | 资源分类 |
| description | string(2048) | 是 | 资源描述 |
| file | binary | 是 | 资源文件 |
| license | string | 是 | 开源协议 |
| tags | array[string] | 否 | 标签 |

上传后进入审核流程（见 US-3.3 审核机制），审核通过后公开展示。

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 401 | 未登录尝试下载 | 提示「请登录后下载」，跳转登录页 |
| 429 | 超过每日下载限额 | 提示「今日下载次数已达上限（50次），请明天再试」 |
| 404 | 资源已下架 | 提示「该资源已下架或不存在」 |

### 后置条件

1. 下载计数器 +1，更新热门排序
2. 下载记录用于个性化推荐
3. 资源文件通过 CDN 分发，确保全国范围高速下载

---

## US-3.3: 内容发布与管理 🆕

### 概述

社区支持用户发布技术文章、最佳实践、问答求助、平台公告等内容，所有用户生成内容（UGC）需经审核后展示。提供分类检索和个性化推荐能力。

### 前置条件

1. 发布内容需登录
2. 浏览公开内容无需登录
3. 用户账号未被封禁

### 操作步骤

#### 步骤 1：创建内容

用户进入社区「发布」页面，选择内容类型并编辑。

**请求：**
```
POST /api/v1/community/contents
```

**表单字段定义：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| title | string(200) | 是 | 内容标题 |
| type | enum | 是 | `article`=技术文章 / `best_practice`=最佳实践 / `qa`=问答求助 / `announcement`=公告 |
| category | enum | 是 | 内容分类：`chip_evaluation`=芯片评测 / `model_optimization`=模型优化 / `operator_development`=算子开发 / `deployment`=部署实践 / `other`=其他 |
| body | string(50000) | 是 | 正文内容（支持 Markdown 格式） |
| tags | array[string] | 否 | 标签，最多 5 个 |
| cover_image | string(URL) | 否 | 封面图 URL |
| attachments | array[file] | 否 | 附件，最多 5 个，单个 ≤ 20MB |
| related_report_id | string(UUID) | 否 | 关联评测报告（可选） |

**内容类型说明：**

| 类型 | 枚举值 | 说明 | 发布者限制 |
|------|--------|------|-----------|
| 技术文章 | `article` | 技术分享、经验总结 | 所有登录用户 |
| 最佳实践 | `best_practice` | 实际案例、调优经验 | 所有登录用户 |
| 问答求助 | `qa` | 技术问题、求助帖 | 所有登录用户 |
| 公告 | `announcement` | 平台官方公告 | 仅 super_admin |

#### 步骤 2：内容预览

用户编辑完成后可预览最终渲染效果。

**请求：**
```
POST /api/v1/community/contents/preview
```

返回渲染后的 HTML 预览。

#### 步骤 3：提交审核

用户确认内容无误后提交审核。

**请求：**
```
POST /api/v1/community/contents/{content_id}/submit
```

**审核流程：**

```
编辑(draft) → 提交(pending_review) → 自动审核(auto_reviewing)
    ↓ 通过                                    ↓ 不通过
展示(published) ← 人工复审(manual_reviewing) ← 标记待人工(flagged)
                                              ↓ 不通过
                                         退回修改(rejected)
```

**审核机制详情：**

| 审核阶段 | 审核方式 | 时间要求 | 审核内容 |
|---------|---------|---------|---------|
| 自动审核 | 机器审核 | ≤ 5 秒 | 敏感词过滤、广告识别、重复内容检测、格式校验 |
| 人工复审 | 运营人员 | ≤ 24 小时 | 内容质量、技术准确性、合规性 |

**自动审核规则：**

| 规则 | 触发条件 | 处理 |
|------|---------|------|
| 敏感词 | 命中敏感词库 | 自动拒绝，提示具体原因 |
| 广告检测 | 疑似推广/引流内容 | 标记待人工复审 |
| 重复检测 | 与已有内容相似度 > 80% | 标记待人工复审 |
| 格式校验 | 内容为空或格式异常 | 自动拒绝 |
| 纯新用户 | 用户首次发布 | 标记待人工复审 |

**审核 SLA：**
- 自动审核通过：即时发布
- 需人工复审：≤ 24 小时内完成
- 超时未审核：自动升级通知管理员

#### 步骤 4：内容检索与推荐

**检索请求：**
```
GET /api/v1/community/contents?keyword={keyword}&type={type}&category={category}&sort={sort}&page=1&page_size=20
```

| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 全文搜索（标题 + 正文） |
| type | enum | 内容类型过滤 |
| category | enum | 内容分类过滤 |
| tags | string | 标签过滤（逗号分隔） |
| sort | enum | `newest`（默认）/ `hottest` / `most_liked` |
| author_id | string | 按作者过滤 |

**个性化推荐（登录用户）：**

```
GET /api/v1/community/contents/recommended?limit=10
```

推荐算法基于：
- 用户历史浏览/点赞/收藏的内容标签
- 用户所属行业和关注领域
- 内容热度（近 7 天互动量加权）
- 协同过滤（相似用户的偏好）

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 400 | 内容正文为空或过短（< 50 字） | 提示「内容过短，请补充详细信息」 |
| 403 | 账号被封禁 | 提示「您的账号已被限制发布内容，如有疑问请联系管理员」 |
| 422 | 自动审核不通过 | 提示具体原因（如「内容含敏感词：{word}，请修改后重新提交」） |
| 429 | 发布频率过高 | 提示「发布过于频繁，请稍后再试」，限制：10 篇/天 |

### 后置条件

1. 发布成功的内容进入搜索索引
2. 关注该作者的用户收到新内容通知
3. 内容审核结果通知发布者（站内消息 + 邮件）
4. 作者获得发布积分（见 US-3.6）

---

## US-3.4: 互动交流 🆕

### 概述

社区提供完整的互动交流功能，包括问答体系（提问→解答→采纳→复盘）、内容互动（点赞/收藏/评论/分享）、热门内容排行（日榜/周榜/月榜）。

### 前置条件

1. 互动操作（点赞、评论、回答等）需登录
2. 浏览互动内容无需登录
3. 用户账号未被封禁

### 操作步骤

#### 步骤 1：问答体系

**1.1 提问**

用户发布类型为 `qa` 的内容即为提问（参见 US-3.3）。

额外字段：

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| bounty_points | integer | 否 | 悬赏积分（0~500），吸引高质量回答 |
| urgent | boolean | 否 | 是否标记为紧急，默认 false |

**1.2 解答**

**请求：**
```
POST /api/v1/community/contents/{content_id}/answers
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| body | string(10000) | 是 | 回答内容（Markdown） |
| attachments | array[file] | 否 | 附件 |

**1.3 采纳最佳答案**

仅提问者可操作：
```
POST /api/v1/community/contents/{content_id}/answers/{answer_id}/accept
```

**采纳规则：**
- 每个问题只能采纳一个最佳答案
- 采纳后该答案置顶显示，标记 ✅
- 被采纳者获得悬赏积分（如有）+ 固定采纳奖励积分
- 提问超过 7 天未采纳，系统推送提醒

**1.4 复盘（提问者总结）**

```
PUT /api/v1/community/contents/{content_id}/summary
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| summary | string(2000) | 是 | 问题解决总结 |
| solution_steps | array[string] | 否 | 解决步骤列表 |

#### 步骤 2：内容互动

**2.1 点赞/取消点赞**
```
POST /api/v1/community/contents/{content_id}/like
DELETE /api/v1/community/contents/{content_id}/like
```

**2.2 收藏/取消收藏**
```
POST /api/v1/community/contents/{content_id}/favorite
DELETE /api/v1/community/contents/{content_id}/favorite
```

**2.3 评论**
```
POST /api/v1/community/contents/{content_id}/comments
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| body | string(2000) | 是 | 评论内容 |
| reply_to_comment_id | string(UUID) | 否 | 回复某条评论（支持嵌套，最多 3 层） |

**评论审核：** 与内容审核机制一致，实时自动审核 + 人工抽检。

**2.4 分享**
```
POST /api/v1/community/contents/{content_id}/share
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| platform | enum | 是 | `link`=复制链接 / `wechat`=微信 / `weibo`=微博 / `twitter`=Twitter |

返回分享链接或二维码。

**互动数据字段汇总：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| like_count | integer | 点赞数 |
| favorite_count | integer | 收藏数 |
| comment_count | integer | 评论数 |
| share_count | integer | 分享数 |
| view_count | integer | 浏览数 |
| answer_count | integer | 回答数（仅 QA 类型） |
| is_liked | boolean | 当前用户是否已点赞 |
| is_favorited | boolean | 当前用户是否已收藏 |

#### 步骤 3：热门内容排行

**请求：**
```
GET /api/v1/community/contents/trending?period={period}&type={type}&limit=20
```

| 参数 | 类型 | 说明 |
|------|------|------|
| period | enum | `daily`=日榜 / `weekly`=周榜 / `monthly`=月榜 |
| type | enum | 内容类型过滤（可选） |
| limit | integer | 返回条数，默认 20，最大 50 |

**热门排行算法：**
```
trending_score = (
    view_count * 1 +
    like_count * 3 +
    comment_count * 5 +
    favorite_count * 4 +
    share_count * 6 +
    answer_count * 8
) * time_decay_factor
```

其中 `time_decay_factor = 1 / (1 + hours_since_publish / 24)` 用于时间衰减。

**排行刷新频率：**

| 榜单 | 刷新频率 | 说明 |
|------|---------|------|
| 日榜 | 每小时刷新 | 展示当日热门 |
| 周榜 | 每 6 小时刷新 | 展示本周热门 |
| 月榜 | 每日刷新 | 展示本月热门 |

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 401 | 未登录尝试互动 | 提示「请登录后操作」 |
| 403 | 尝试采纳非自己问题的答案 | 提示「仅提问者可采纳最佳答案」 |
| 409 | 重复点赞 | 幂等处理，返回成功 |
| 409 | 重复采纳 | 提示「该问题已采纳最佳答案，如需更换请先取消当前采纳」 |
| 429 | 评论频率过高 | 提示「评论过于频繁，请稍后再试」，限制：30 条/小时 |

### 后置条件

1. 互动行为实时更新计数器
2. 相关积分实时发放（见 US-3.6）
3. 被互动的内容作者收到通知（站内消息）
4. 互动数据用于个性化推荐算法

---

## US-3.5: 需求对接 🆕

### 概述

社区提供需求对接功能，连接「应用方」（需要芯片/算力的企业）和「研发方」（芯片厂商/方案商）。平台作为纯公益中立方，不收取任何中介费用，仅提供信息展示和对接撮合服务。

### 前置条件

1. 用户已登录
2. 用户已完善企业/个人认证信息（📅 Phase 2 企业认证）
3. 用户账号未被封禁

### 操作步骤

#### 步骤 1：发布需求

**请求：**
```
POST /api/v1/community/demands
```

**表单字段定义：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| title | string(200) | 是 | 需求标题 |
| type | enum | 是 | `application`=应用方需求 / `research`=研发方需求 |
| category | enum | 是 | `chip_procurement`=芯片采购 / `solution`=解决方案 / `optimization`=性能优化 / `testing`=评测服务 / `cooperation`=合作共建 / `other`=其他 |
| description | string(5000) | 是 | 需求详细描述 |
| budget_range | enum | 否 | `under_100k` / `100k_500k` / `500k_1m` / `above_1m` / `negotiable`=面议 |
| deadline | date | 否 | 需求截止日期 |
| contact_visibility | enum | 是 | `public`=公开联系方式 / `private`=仅对接后可见 |
| contact_info | object | 是 | 联系方式 |
| ├── name | string(64) | 是 | 联系人姓名 |
| ├── phone | string(20) | 条件必填 | 联系电话 |
| ├── email | string(128) | 条件必填 | 联系邮箱 |
| ├── wechat | string(64) | 否 | 微信号 |
| tags | array[string] | 否 | 标签，最多 5 个 |
| attachments | array[file] | 否 | 补充材料，最多 3 个 |

**需求类型说明：**

| 类型 | 典型场景 |
|------|---------|
| 应用方需求 | 「我需要一款适配 LLaMA-70B 推理的国产 GPU，预算 50 万以内」 |
| 研发方需求 | 「我们的 AI 芯片寻找典型行业应用场景合作伙伴进行联合验证」 |

#### 步骤 2：需求审核

需求提交后进入审核流程：

**审核规则：**

| 审核项 | 方式 | 说明 |
|--------|------|------|
| 内容合规 | 自动 | 敏感词过滤、违规检测 |
| 真实性初筛 | 自动 | 检查联系方式格式、企业信息一致性 |
| 质量审核 | 人工 | 需求描述是否清晰、是否有对接价值 |
| 审核时效 | ≤ 24h | 超时自动升级 |

#### 步骤 3：需求展示

审核通过后，需求公开展示在社区「需求对接」板块。

**请求（浏览需求列表）：**
```
GET /api/v1/community/demands?type={type}&category={category}&status={status}&page=1&page_size=20
```

**需求状态流转：**

```
draft → pending_review → published → matched → closed
                ↓
            rejected → (修改后重新提交)
```

| 状态 | 说明 |
|------|------|
| `draft` | 草稿 |
| `pending_review` | 待审核 |
| `published` | 已发布（公开展示） |
| `matched` | 已有对接方（仍展示） |
| `closed` | 已关闭（需求方手动关闭或到期自动关闭） |
| `rejected` | 审核不通过 |

#### 步骤 4：需求对接

感兴趣的用户可申请对接：

**请求：**
```
POST /api/v1/community/demands/{demand_id}/connect
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| message | string(1000) | 是 | 自我介绍 / 对接意向说明 |
| contact_info | object | 是 | 对接方联系方式（同发布者字段） |

**对接流程：**
1. 对接申请发送给需求发布者（站内消息 + 邮件通知）
2. 发布者查看申请列表，选择接受或拒绝
3. 接受后双方联系方式互相可见
4. 对接完成后需求方可标记为 `matched`

**公益声明：**
- ⚠️ 平台不参与任何商业交易，不收取中介费
- ⚠️ 平台不为对接结果负责，仅提供信息展示
- ⚠️ 双方交易风险自担

#### 步骤 5：需求闭环

需求方在对接完成后关闭需求：

```
PUT /api/v1/community/demands/{demand_id}/close
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| reason | enum | 是 | `matched`=已找到合适对接方 / `expired`=需求过期 / `cancelled`=取消需求 |
| feedback | string(500) | 否 | 闭环反馈（对平台服务的评价） |

**自动关闭规则：**
- 需求发布超过 90 天未关闭 → 系统提醒发布者
- 超过 120 天未关闭 → 自动标记为 `closed(expired)`

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 400 | 联系方式不完整 | 提示「请至少填写一种联系方式（电话或邮箱）」 |
| 403 | 尝试对接自己的需求 | 提示「不能对接自己发布的需求」 |
| 409 | 重复申请对接 | 提示「您已申请对接该需求，请等待发布者回复」 |
| 429 | 发布需求过于频繁 | 提示「每天最多发布 3 条需求」 |

### 后置条件

1. 需求发布和对接记录计入审计日志
2. 成功对接记录用于平台运营数据统计
3. 发布需求获得积分奖励（见 US-3.6）
4. 自动过期机制确保需求列表时效性

---

## US-3.6: 社区运营与激励 🆕

### 概述

社区通过积分体系和用户等级激励用户持续贡献优质内容，形成活跃的社区生态。积分可用于兑换平台评测资源配额（📅 Phase 2）。同时建立社区规范和违规处理机制，维护健康的社区氛围。

### 前置条件

1. 用户已登录
2. 积分系统正常运行

### 操作步骤

#### 步骤 1：积分获取

**积分规则表：**

| 行为 | 积分值 | 每日上限 | 说明 |
|------|--------|---------|------|
| 发布技术文章 | +20 | 3 次/60 分 | 审核通过后发放 |
| 发布最佳实践 | +30 | 3 次/90 分 | 审核通过后发放 |
| 发布问答求助 | +5 | 5 次/25 分 | 审核通过后发放 |
| 回答问题 | +10 | 10 次/100 分 | 审核通过后发放 |
| 回答被采纳 | +50 | 无上限 | 采纳时发放 |
| 获得点赞 | +2 | 50 次/100 分 | 实时发放 |
| 获得收藏 | +3 | 30 次/90 分 | 实时发放 |
| 发表评论 | +1 | 20 次/20 分 | 实时发放 |
| 每日签到 | +5 | 1 次/5 分 | 连续签到有额外奖励 |
| 连续签到 7 天 | +30 | - | 额外奖励 |
| 连续签到 30 天 | +150 | - | 额外奖励 |
| 上传社区资源 | +40 | 2 次/80 分 | 审核通过后发放 |
| 发布需求 | +10 | 3 次/30 分 | 审核通过后发放 |
| 举报违规内容（确认有效） | +20 | 无上限 | 人工确认后发放 |

**积分扣减规则：**

| 行为 | 扣减积分 | 说明 |
|------|---------|------|
| 发布内容被删除（违规） | -50 | 同时记录违规记录 |
| 恶意刷积分（系统检测） | 扣除全部异常积分 | 严重者封禁 |
| 悬赏积分支出 | -N | 回答被采纳时自动转移 |

#### 步骤 2：用户等级

**等级体系：**

| 等级 | 名称 | 所需积分 | 徽章 | 权益 |
|------|------|---------|------|------|
| Lv.1 | 新手 | 0 | 🌱 | 基础功能 |
| Lv.2 | 进阶 | 500 | 🌿 | 每日发布上限 +50%、评论免审核 |
| Lv.3 | 专家 | 2000 | 🌳 | 专家标识、内容优先展示、免费资源下载无限额 |
| Lv.4 | 资深专家 | 10000 | 🏆 | 资深标识、参与内容审核、📅 Phase 2 评测资源配额奖励 |

**等级计算：** 基于累计积分自动升级，不降级（扣分不影响已达等级）。

**查看积分与等级：**
```
GET /api/v1/community/users/{user_id}/profile
```

**系统响应：**
```json
{
  "code": 0,
  "data": {
    "user_id": "usr_xxxx",
    "nickname": "芯片爱好者",
    "level": 3,
    "level_name": "专家",
    "badge": "🌳",
    "total_points": 2580,
    "points_to_next_level": 7420,
    "content_count": 45,
    "answer_count": 120,
    "accepted_count": 38,
    "like_received": 560,
    "joined_at": "2026-01-15T08:00:00Z"
  }
}
```

#### 步骤 3：积分用途

**当前可用（MVP）：**

| 用途 | 积分消耗 | 说明 |
|------|---------|------|
| 悬赏提问 | 自定义（10~500） | 吸引高质量回答 |
| 专属徽章展示 | 0（等级自动解锁） | 社区身份标识 |

**📅 Phase 2 计划：**

| 用途 | 积分消耗 | 说明 |
|------|---------|------|
| 兑换评测资源配额 | 1000 分 = 1 小时 GPU 评测时长 | 平台提供的公共评测资源 |
| 兑换高级报告 | 500 分/份 | 解锁高级版评测报告 |
| 兑换定制服务 | 面议 | 联系平台运营 |

#### 步骤 4：社区规范

**社区行为准则：**

| 类别 | 规范内容 |
|------|---------|
| 内容质量 | 鼓励原创、技术深度分享；禁止水帖、AI 生成低质量内容 |
| 交流礼仪 | 友善交流、就事论事；禁止人身攻击、恶意引战 |
| 知识产权 | 引用需标注来源；禁止未授权转载、侵犯知识产权 |
| 商业行为 | 禁止在内容中植入广告、引流到外部平台 |
| 数据安全 | 禁止发布涉密数据、未脱敏的企业数据 |

#### 步骤 5：违规处理

**违规举报：**
```
POST /api/v1/community/reports
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| target_type | enum | 是 | `content` / `comment` / `user` / `demand` |
| target_id | string(UUID) | 是 | 被举报对象 ID |
| reason | enum | 是 | `spam`=垃圾信息 / `abuse`=辱骂攻击 / `copyright`=侵权 / `ads`=广告 / `sensitive`=敏感信息 / `other` |
| description | string(500) | 否 | 补充说明 |
| evidence | array[string(URL)] | 否 | 举证截图 URL |

**违规处理阶梯：**

| 违规次数 | 处理措施 | 说明 |
|---------|---------|------|
| 第 1 次 | 警告 + 删除违规内容 | 站内通知 |
| 第 2 次 | 禁言 7 天 + 扣除 100 积分 | 站内通知 + 邮件 |
| 第 3 次 | 禁言 30 天 + 扣除 500 积分 | 站内通知 + 邮件 |
| 第 4 次及以上 | 永久封禁 | 账号标记为 `banned` |
| 严重违规（一次性） | 直接永久封禁 | 如发布违法信息、恶意攻击平台等 |

**申诉机制：**
```
POST /api/v1/community/appeals
```

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| violation_id | string(UUID) | 是 | 关联的违规记录 ID |
| reason | string(1000) | 是 | 申诉理由 |
| evidence | array[string(URL)] | 否 | 申诉证据 |

- 申诉处理时效：≤ 72 小时
- 申诉结果：维持原处理 / 减轻处罚 / 撤销处罚
- 每条违规记录最多申诉 1 次

### 异常处理

| 错误码 | 场景 | 处理方式 |
|--------|------|---------|
| 403 | 封禁用户尝试操作 | 提示「您的账号已被封禁，如有疑问请提交申诉」 |
| 403 | 禁言用户尝试发布 | 提示「您的账号处于禁言状态，剩余 {days} 天，如有疑问请提交申诉」 |
| 409 | 重复举报同一内容 | 提示「您已举报过该内容，请等待处理结果」 |
| 400 | 积分不足（悬赏） | 提示「积分不足，当前积分 {points}，所需 {required}」 |

### 后置条件

1. 积分变动实时记录到积分流水表（可查询完整积分历史）
2. 用户等级变动触发站内通知 + 邮件恭喜
3. 违规处理记录永久保留（用于累计判定）
4. 社区运营数据每日汇总：DAU、发帖量、回答量、对接量等指标

---

# 附录

## A. 模块2 & 3 状态枚举汇总

| 枚举名 | 可选值 | 使用场景 |
|--------|--------|---------|
| report_status | `draft` / `published` / `withdrawn` / `archived` | 报告状态 |
| report_visibility | `private` / `tenant` / `platform` / `public` | 报告可见范围 |
| report_tier | `basic` / `advanced` | 报告级别 |
| asset_type | `model` / `dataset` / `operator` / `script` / `template` | 资产类型 |
| share_scope | `personal` / `team` / `platform` | 资产分享范围 |
| content_type | `article` / `best_practice` / `qa` / `announcement` | 社区内容类型 |
| content_status | `draft` / `pending_review` / `auto_reviewing` / `flagged` / `manual_reviewing` / `published` / `rejected` | 内容审核状态 |
| demand_type | `application` / `research` | 需求类型 |
| demand_status | `draft` / `pending_review` / `published` / `matched` / `closed` / `rejected` | 需求状态 |
| leaderboard_type | `comprehensive` / `compute` / `inference` / `efficiency` / `compatibility` | 榜单类型 |
| violation_action | `warning` / `mute_7d` / `mute_30d` / `ban` | 违规处理类型 |
| user_level | `1` / `2` / `3` / `4` | 用户等级 |

## B. Phase 规划标记索引

| 标记 | 功能点 | 所在 User Story |
|------|--------|----------------|
| 📅 Phase 2 | 高级版报告（收费，含深度分析） | US-2.1 |
| 📅 Phase 2 | 资产存储计费（¥0.12/GB/月） | US-2.4 |
| 📅 Phase 2 | 企业认证 | US-3.5 |
| 📅 Phase 2 | 积分兑换评测资源配额 | US-3.6 |
| 📅 Phase 2 | 积分兑换高级报告 | US-3.6 |

## C. 非功能性要求

| 维度 | 要求 | 说明 |
|------|------|------|
| 性能 | 榜单页加载 ≤ 1s | CDN 缓存 + 预计算 |
| 性能 | 报告导出 ≤ 60s（基础版） | 异步任务 + 进度反馈 |
| 性能 | 社区内容搜索 ≤ 500ms | Elasticsearch 全文索引 |
| 可用性 | 社区模块 99.9% SLA | 读写分离 + 多副本 |
| 安全 | 日志加密 AES-256-GCM | KMS 密钥管理 |
| 安全 | 审计日志保留 3 年 | 合规要求 |
| 安全 | 租户数据完全隔离 | 行级安全策略 |

---

> **文档结束** — AHVP 产品设计 v3.0 第二部分（模块2 + 模块3）
> 
> 菜菜子 🥬 | 2026-04-04
# AHVP 产品设计文档 v3.0 — 第三部分

> 模块4：用户体系 | 模块5：异构资源纳管 | 计费体系 | 页面设计 | 数据模型 | 分期计划 | 附录

---

# 第五部分：模块4 — 用户体系 🔴

> 对齐客户 PRD 第五部分，全面覆盖用户全生命周期管理。

---

## US-4.1: 用户注册与认证

### 概述

系统支持四种用户类型（个人 / 企业 / 科研机构 / 管理员），通过多层级认证体系保障平台安全。注册流程需经过表单填写、验证码验证、邮箱确认和管理员审核（企业/科研用户）等环节。

### 前置条件

| # | 条件 | 说明 |
|---|------|------|
| P1 | 用户未拥有平台账号 | 邮箱/用户名未被注册 |
| P2 | 网络连接正常 | 可访问平台注册页面 |
| P3 | 邮箱地址有效 | 能接收确认邮件 |

### 操作步骤

#### Step 1: 填写注册表单

用户访问 `/register` 页面，填写以下信息：

**注册表单字段定义：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 | 说明 |
|------|------|------|------|----------|------|
| 用户名 | `username` | 文本 | ✅ | 4-30字符，仅允许字母/数字/下划线，全局唯一 | 登录凭据之一 |
| 邮箱 | `email` | 邮箱 | ✅ | 合法邮箱格式，不可重复注册 | 主要联系方式 + 登录凭据 |
| 密码 | `password` | 密码 | ✅ | 8-32字符，必须包含大写+小写+数字 | 前端实时校验强度 |
| 确认密码 | `confirm_password` | 密码 | ✅ | 与密码字段完全一致 | 防止输入错误 |
| 手机号 | `phone` | 电话 | ❌ | 合法中国大陆手机号（11位） | 可选，用于安全认证 |
| 组织名称 | `organization` | 文本 | ✅ | 1-200字符 | 所属组织/机构/公司 |
| 用户类型 | `user_type` | 下拉 | ✅ | 枚举：`personal` / `enterprise` / `research` / `admin` | admin 仅超管可分配 |
| 角色 | `role` | 下拉 | ✅ | 枚举：`engineer` / `product_mgr` / `buyer` / `other` | 用于画像与推荐 |
| 图形验证码 | `captcha` | 图形 | ✅ | 4位字母数字，120秒有效 | 防机器人注册 |

> **注意：** `user_type = admin` 选项在公开注册页面不可见，仅由超级管理员在后台指定。

#### Step 2: 前端实时校验

| 校验项 | 触发时机 | 校验逻辑 | 错误提示 |
|--------|----------|----------|----------|
| 用户名格式 | blur | 正则 `^[a-zA-Z0-9_]{4,30}$` | "用户名需4-30字符，仅支持字母、数字、下划线" |
| 用户名唯一性 | blur（防抖500ms） | 调用 `GET /api/v1/users/check?username=xxx` | "该用户名已被注册" |
| 邮箱格式 | blur | RFC 5322 格式校验 | "请输入有效的邮箱地址" |
| 邮箱唯一性 | blur（防抖500ms） | 调用 `GET /api/v1/users/check?email=xxx` | "该邮箱已被注册" |
| 密码强度 | input | 长度8-32 + 含大写 + 含小写 + 含数字 | 实时显示强度条（弱/中/强） |
| 确认密码 | blur | 与 password 字段值一致 | "两次输入的密码不一致" |
| 手机号格式 | blur | 正则 `^1[3-9]\d{9}$` | "请输入有效的手机号" |
| 验证码 | submit | 与服务端生成值比对 | "验证码错误或已过期" |

#### Step 3: 提交注册请求

```
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "password": "string（前端 SHA256 哈希后传输）",
  "phone": "string | null",
  "organization": "string",
  "user_type": "personal | enterprise | research",
  "role": "engineer | product_mgr | buyer | other",
  "captcha": "string",
  "captcha_id": "string"
}
```

#### Step 4: 邮箱确认

- 系统发送确认邮件至用户邮箱，包含确认链接
- 确认链接格式：`{domain}/verify-email?token={uuid}&expires={timestamp}`
- **有效期：24小时**
- 用户点击链接后，邮箱状态变为 `verified`
- 超时未确认：账号保留但标记为 `email_unverified`，7天后自动清理

#### Step 5: 管理员审核（企业/科研用户）

| 用户类型 | 审核要求 | 审核 SLA |
|----------|----------|----------|
| 个人（personal） | 无需审核，邮箱确认后即可使用 | — |
| 企业（enterprise） | 需上传营业执照 + 管理员人工审核 | ≤24h |
| 科研机构（research） | 需上传机构证明 + 管理员人工审核 | ≤24h |
| 管理员（admin） | 仅超管后台指定 | — |

### 系统响应

| 场景 | HTTP 状态 | 响应 | 说明 |
|------|-----------|------|------|
| 注册成功（个人） | 201 | `{ "user_id": "uuid", "status": "email_pending" }` | 提示检查邮箱 |
| 注册成功（企业/科研） | 201 | `{ "user_id": "uuid", "status": "pending_review" }` | 提示等待审核 |
| 用户名已存在 | 409 | `{ "error": "USERNAME_EXISTS" }` | — |
| 邮箱已注册 | 409 | `{ "error": "EMAIL_EXISTS" }` | — |
| 验证码错误 | 400 | `{ "error": "CAPTCHA_INVALID" }` | — |
| 密码不符合策略 | 400 | `{ "error": "PASSWORD_POLICY_VIOLATION" }` | — |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 邮件发送失败 | 重试3次（间隔1s/5s/30s），仍失败则提示用户手动重发 |
| 确认链接过期 | 用户可在登录页请求重发确认邮件 |
| 审核超时（>24h） | 系统自动发提醒给审核管理员 |
| 审核拒绝 | 发送拒绝邮件（含原因），用户可修改资料重新提交 |
| 频繁注册（同 IP 5次/小时） | 触发 IP 级限流，要求滑块验证 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 用户记录写入 `users` 表，状态为 `email_pending` 或 `pending_review` |
| R2 | 密码以 bcrypt (cost=12) 哈希存储，明文不落库 |
| R3 | 注册事件写入审计日志 |
| R4 | 企业/科研用户：审核工单创建，分配给管理员 |

---

### 多层级认证体系 🆕

系统提供三级递进式认证，不同认证等级对应不同的平台能力：

| 认证等级 | 认证方式 | 解锁能力 | 要求 |
|----------|----------|----------|------|
| **基础认证** | 手机号 + 邮箱实名验证 | 查看公开芯片数据、浏览社区 | 所有用户必须完成 |
| **高级认证** | 企业资质上传 + 人工审核（≤24h） | 创建评测任务、注册芯片、管理资源 | 企业/科研用户必须完成 |
| **安全认证** | 双重认证 (2FA)：密码 + TOTP 验证码 | 管理员操作、敏感数据导出、计费相关 | 管理员必须开启，其他用户可选 |

**高级认证流程：**

1. 用户上传资质文件（营业执照 / 机构证明 / 事业单位法人证书）
2. 系统初步校验文件格式（PDF/JPG/PNG，≤10MB）
3. 分配审核工单给平台管理员
4. 管理员在后台审核 → 通过 / 拒绝（附原因）
5. 审核结果通知用户（邮件 + 站内信）

**2FA 配置流程：**

1. 用户进入 "安全设置" → 开启双重认证
2. 系统生成 TOTP 密钥 + 二维码（兼容 Google Authenticator / Microsoft Authenticator）
3. 用户扫码绑定 → 输入当前 6 位验证码确认
4. 系统生成 8 个一次性恢复码（用户必须保存）
5. 后续登录需输入密码 + TOTP 验证码

---

### 第三方登录 📅 Phase 2

| 登录方式 | 协议 | 说明 |
|----------|------|------|
| 企业微信 | OAuth 2.0 | 企业内部用户快捷登录 |
| 钉钉 | OAuth 2.0 | 企业内部用户快捷登录 |
| GitHub | OAuth 2.0 | 面向开发者/开源社区用户 |

**绑定规则：**
- 首次第三方登录 → 若邮箱匹配已有账号则自动绑定，否则引导注册
- 一个平台账号可绑定多个第三方账号
- 用户可在设置页解绑第三方登录

---

### 密码策略

| 策略项 | 规则 |
|--------|------|
| 最小长度 | 8 字符 |
| 最大长度 | 32 字符 |
| 复杂度 | 必须同时包含：大写字母 + 小写字母 + 数字 |
| 强制更新周期 | 90 天 |
| 历史密码检查 | 不能与最近 5 次密码重复 |
| 连续错误锁定 | 连续 5 次密码错误 → 锁定账号 1 小时 |
| 锁定通知 | 锁定时发送邮件通知账号所有者 |
| 密码重置 | 通过邮箱验证链接重置（有效期 1 小时） |

---

## US-4.2: 多租户管理

### 概述

平台支持多租户隔离，企业/科研机构/管理员可创建独立租户空间，实现数据、资源、权限和操作的四层隔离。

### 前置条件

| # | 条件 | 说明 |
|---|------|------|
| P1 | 用户已完成高级认证 | 企业/科研用户资质已审核通过 |
| P2 | 用户类型为 enterprise / research / admin | 个人用户不可创建租户 |
| P3 | 未超过租户创建配额 | 默认每个用户最多创建 3 个租户 |

### 操作步骤

#### Step 1: 创建租户

用户进入 "组织管理" → "创建租户"，填写以下信息：

**租户创建表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 | 说明 |
|------|------|------|------|----------|------|
| 租户名称 | `tenant_name` | 文本 | ✅ | 2-100字符，全局唯一 | 组织显示名 |
| 租户标识 | `tenant_slug` | 文本 | ✅ | 2-50字符，小写字母/数字/连字符，全局唯一 | URL 路径标识 |
| 租户描述 | `description` | 文本 | ❌ | ≤500字符 | 组织简介 |
| 联系人 | `contact_name` | 文本 | ✅ | 2-50字符 | 主要联系人姓名 |
| 联系邮箱 | `contact_email` | 邮箱 | ✅ | 合法邮箱格式 | 管理通知邮箱 |
| 联系电话 | `contact_phone` | 电话 | ❌ | 合法手机号 | — |
| 所属行业 | `industry` | 下拉 | ❌ | 预设行业列表 | 用于统计分析 |

```
POST /api/v1/tenants
Content-Type: application/json

{
  "tenant_name": "string",
  "tenant_slug": "string",
  "description": "string | null",
  "contact_name": "string",
  "contact_email": "string",
  "contact_phone": "string | null",
  "industry": "string | null"
}
```

#### Step 2: 配额配置

管理员为租户设置资源配额：

| 配额项 | 标识 | 默认值（企业） | 默认值（科研） | 说明 |
|--------|------|---------------|---------------|------|
| 最大芯片数 | `max_chips` | 20 | 10 | 可注册的芯片数量上限 |
| 并发任务数 | `max_concurrent_tasks` | 5 | 3 | 同时运行的评测任务数 |
| 存储容量 | `max_storage_gb` | 100 GB | 50 GB | 评测数据与报告存储 |
| 成员上限 | `max_members` | 50 | 30 | 租户内最大成员数 |
| 有效期 | `expires_at` | 1 年 | 1 年 | 到期前 30 天提醒续期 |

#### Step 3: 四层隔离 🆕

| 隔离层 | 实现方式 | 说明 |
|--------|----------|------|
| **数据隔离** | 所有业务表包含 `tenant_id` 字段，查询自动追加租户过滤条件 | 租户间数据完全不可见 |
| **资源隔离** | 计算节点按租户分配独立资源池，配额独立计量 | 避免资源争抢 |
| **权限隔离** | RBAC 权限作用域限定在租户内，跨租户操作需平台管理员权限 | 最小权限原则 |
| **操作隔离** | 审计日志按租户隔离存储，管理员仅可查看本租户日志 | 操作可追溯 |

### 租户状态管理

| 状态 | 说明 | 可执行操作 | 触发条件 |
|------|------|-----------|----------|
| **正常** (active) | 所有功能可用 | 全部操作 | 创建成功 / 解冻 |
| **冻结** (frozen) | 只读模式，不可创建新任务 | 查看数据、导出报告 | 欠费 / 管理员手动冻结 / 安全原因 |
| **注销** (deactivated) | 数据保留 30 天后永久删除 | 无（仅管理员可恢复） | 用户主动注销 / 过期未续 |

### 租户成员管理

**邀请流程：**

1. 租户管理员进入 "成员管理" → "邀请成员"
2. 输入被邀请人邮箱 + 分配角色
3. 系统发送邀请链接邮件（**有效期 7 天**）
4. 被邀请人点击链接 → 若已有账号直接加入，否则引导注册后加入
5. 租户管理员可在成员列表中查看邀请状态

**成员邀请表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 邮箱 | `invite_email` | 邮箱 | ✅ | 合法格式，不可邀请已在本租户的成员 |
| 角色 | `invite_role` | 下拉 | ✅ | 租户内预置角色或自定义角色 |
| 部门 | `department` | 下拉 | ❌ | 已创建的部门列表 |
| 备注 | `note` | 文本 | ❌ | ≤200字符 |

**部门管理：**
- 租户管理员可创建部门层级（最多 3 级）
- 成员可归属多个部门
- 部门可配置独立的资源配额子集

### 系统响应

| 场景 | HTTP 状态 | 响应 |
|------|-----------|------|
| 创建成功 | 201 | `{ "tenant_id": "uuid", "status": "active" }` |
| 名称已存在 | 409 | `{ "error": "TENANT_NAME_EXISTS" }` |
| 超过创建配额 | 403 | `{ "error": "TENANT_LIMIT_EXCEEDED" }` |
| 无权限创建 | 403 | `{ "error": "INSUFFICIENT_PERMISSION" }` |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 邀请邮件发送失败 | 重试3次，仍失败提示手动复制邀请链接 |
| 邀请链接过期 | 租户管理员可重新发送邀请 |
| 配额超限 | 冻结新建操作，提示联系管理员扩容 |
| 成员数超限 | 拒绝新邀请，提示升级配额 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 租户记录写入 `tenants` 表 |
| R2 | 创建者自动成为租户 Owner 角色 |
| R3 | 默认配额已初始化 |
| R4 | 操作记录审计日志 |

---

## US-4.3: 角色与权限管理 (RBAC)

### 概述

基于 RBAC（基于角色的访问控制）模型，提供六大预置角色 + 自定义角色能力，支持权限继承和操作审计。

### 前置条件

| # | 条件 |
|---|------|
| P1 | 操作者拥有角色管理权限（通常为租户 Owner 或 Admin） |
| P2 | 用户已加入某个租户 |

### 六大预置角色

| 角色 | 标识 | 说明 | 不可删除 |
|------|------|------|----------|
| **超级管理员** | `super_admin` | 平台级全权限，管理所有租户 | ✅ |
| **租户所有者** | `tenant_owner` | 租户级全权限，含成员和配额管理 | ✅ |
| **租户管理员** | `tenant_admin` | 租户内管理权限，不含删除租户 | ✅ |
| **评测工程师** | `engineer` | 注册芯片、创建/执行评测、查看报告 | ✅ |
| **产品经理** | `product_mgr` | 查看芯片、查看报告、导出数据、管理模板 | ✅ |
| **采购/只读** | `buyer` | 只读访问：查看芯片列表、查看公开报告 | ✅ |

### 权限矩阵

| 功能模块 | 操作 | super_admin | tenant_owner | tenant_admin | engineer | product_mgr | buyer |
|----------|------|:-----------:|:------------:|:------------:|:--------:|:-----------:|:-----:|
| **芯片管理** | 注册芯片 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| | 编辑芯片 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| | 删除芯片 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 查看芯片 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | 芯片对比 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **评测管理** | 创建评测 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| | 执行评测 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| | 取消评测 | ✅ | ✅ | ✅ | ✅（仅自己） | ❌ | ❌ |
| | 查看评测 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | 管理模板 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **报告管理** | 查看报告 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | 导出报告 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| | 删除报告 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **资源管理** | 接入节点 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 管理资源池 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 查看资源 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **用户管理** | 邀请成员 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 管理角色 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 管理租户 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | 平台管理 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **计费管理** 📅 | 查看账单 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | 充值/付款 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 自定义角色 🆕

#### 操作步骤

1. 租户 Owner/Admin 进入 "角色管理" → "创建自定义角色"
2. 填写角色信息

**自定义角色表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 角色名称 | `role_name` | 文本 | ✅ | 2-50字符，租户内唯一 |
| 角色描述 | `role_desc` | 文本 | ❌ | ≤200字符 |
| 继承角色 | `parent_role` | 下拉 | ❌ | 可选择已有角色作为父角色 |
| 权限列表 | `permissions` | 多选 | ✅ | 至少选择一个权限 |

3. 配置具体权限（勾选权限列表）
4. 若选择了父角色，自动继承父角色的所有权限（可追加、不可缩减）
5. 保存 → 角色立即可用

### 权限继承 🆕

```
super_admin
  └── tenant_owner
        └── tenant_admin
              ├── engineer
              └── product_mgr
                    └── buyer
```

- 子角色**自动继承**父角色的所有权限
- 自定义角色可选择任一预置角色作为父角色
- 权限变更实时生效（修改父角色权限，子角色同步更新）
- 禁止循环继承

### 操作审计 🆕

**审计范围：** 所有用户操作均记录审计日志

| 字段 | 说明 |
|------|------|
| `audit_id` | 审计记录唯一 ID |
| `tenant_id` | 所属租户 |
| `user_id` | 操作用户 |
| `action` | 操作类型（CREATE / UPDATE / DELETE / LOGIN / EXPORT 等） |
| `resource_type` | 资源类型（chip / evaluation / report / user / role 等） |
| `resource_id` | 资源 ID |
| `details` | 操作详情（JSON，含变更前后值） |
| `ip_address` | 操作来源 IP |
| `user_agent` | 客户端信息 |
| `created_at` | 操作时间 |

**审计策略：**
- 日志保留期限：**3 年**
- 日志不可篡改（写入后只读，append-only）
- 超级管理员可导出审计日志（CSV 格式）
- 敏感操作（删除、权限变更、资金操作）标记为高优先级

### 系统响应

| 场景 | HTTP 状态 | 响应 |
|------|-----------|------|
| 角色创建成功 | 201 | `{ "role_id": "uuid", "role_name": "string" }` |
| 角色名已存在 | 409 | `{ "error": "ROLE_NAME_EXISTS" }` |
| 无权限操作 | 403 | `{ "error": "AUTH-003", "message": "您没有权限执行此操作" }` |
| 循环继承 | 400 | `{ "error": "CIRCULAR_INHERITANCE" }` |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 删除已分配角色 | 拒绝删除，提示先移除该角色下的所有成员 |
| 权限变更影响在线用户 | 实时生效，当前请求完成后下次请求应用新权限 |
| 审计日志写入失败 | 异步重试队列，3次仍失败发告警 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 角色记录写入 `roles` 表 |
| R2 | 权限关系写入 `role_permissions` 表 |
| R3 | 角色变更记录审计日志 |

---

## US-4.4: 用户画像与个性化 🆕 📅 Phase 2

### 概述

通过采集用户行为数据构建用户画像，提供个性化推荐和界面设置能力。

### 前置条件

| # | 条件 |
|---|------|
| P1 | 用户已登录且完成基础认证 |
| P2 | 用户同意数据采集隐私协议 |

### 操作步骤

#### Step 1: 画像数据采集

系统自动采集以下维度数据：

| 数据维度 | 采集内容 | 采集方式 | 存储周期 |
|----------|----------|----------|----------|
| 评测历史 | 评测过的芯片类型、算子分布、频率 | 后端记录 | 永久 |
| 资产使用 | 常用资源类型、使用时长、消耗量 | 后端记录 | 1 年 |
| 内容浏览 | 浏览过的芯片详情、报告、社区帖子 | 前端埋点 | 6 个月 |
| 搜索行为 | 搜索关键词、筛选条件 | 前端埋点 | 3 个月 |

#### Step 2: 画像标签生成

基于采集数据，系统自动为用户打标签：

| 标签类别 | 示例标签 | 生成规则 |
|----------|----------|----------|
| 芯片偏好 | GPU用户 / NPU用户 / 多架构用户 | 近 3 个月评测芯片类型分布 |
| 使用深度 | 轻度用户 / 中度用户 / 重度用户 | 月均评测次数 |
| 关注领域 | 推理加速 / 训练优化 / 算子兼容 | 评测模板选择偏好 |
| 活跃度 | 日活 / 周活 / 月活 / 沉默 | 最近登录与操作频率 |

#### Step 3: 个性化推荐

| 推荐类型 | 推荐逻辑 | 展示位置 |
|----------|----------|----------|
| 评测模板推荐 | 基于用户芯片偏好推荐匹配模板 | 评测创建页 |
| 芯片推荐 | 基于行业相似用户的芯片选择 | Dashboard |
| 社区内容推荐 | 基于关注领域推荐相关帖子 | 社区首页 |
| 资源推荐 | 基于历史使用推荐适配的计算节点 | 资源管理页 |

#### Step 4: 界面设置

**个性化设置表单：**

| 字段 | 标识 | 类型 | 默认值 | 选项 |
|------|------|------|--------|------|
| 主题模式 | `theme` | 切换 | `light` | 浅色 (light) / 深色 (dark) |
| 界面语言 | `language` | 下拉 | `zh-CN` | 中文 (zh-CN) / English (en-US) |
| Dashboard 布局 | `dashboard_layout` | 选择 | `default` | 默认 / 紧凑 / 宽松 |
| 通知偏好 | `notification_prefs` | 多选 | 全选 | 邮件 / 站内信 / 浏览器推送 |

### 系统响应

| 场景 | HTTP 状态 | 响应 |
|------|-----------|------|
| 设置保存成功 | 200 | `{ "message": "settings_updated" }` |
| 画像数据获取 | 200 | `{ "tags": [...], "preferences": {...} }` |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 埋点数据丢失 | 异步补偿，不影响用户体验 |
| 推荐引擎不可用 | 降级为默认推荐（热门内容） |
| 用户撤回数据授权 | 清除画像数据，停止采集 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 画像数据存入 `user_profiles` 表 |
| R2 | 个性化设置即时生效 |
| R3 | 用户可随时清除画像数据 |

---

## US-4.5: 用户服务与反馈 🆕 📅 Phase 2

### 概述

提供在线客服、帮助中心和反馈处理机制，确保用户问题得到及时响应。

### 前置条件

| # | 条件 |
|---|------|
| P1 | 用户已登录 |

### 操作步骤

#### Step 1: 在线客服

| 项目 | 说明 |
|------|------|
| 入口 | 页面右下角悬浮客服图标 |
| 服务时间 | 工作日 09:00-18:00 |
| 响应 SLA | ≤1 小时 |
| 支持方式 | 在线聊天 → 工单升级 |
| 智能客服 | Phase 3 引入 AI 客服，7×24h 自动应答常见问题 |

#### Step 2: 帮助中心

| 内容类型 | 说明 | 数量（初始） |
|----------|------|-------------|
| FAQ | 常见问题与解答 | ≥50 条 |
| 操作手册 | 各模块图文操作指南 | 覆盖所有功能模块 |
| 视频教程 | 核心功能操作视频（≤5min/个） | ≥10 个 |
| API 文档 | RESTful API 交互式文档（Swagger） | 全量 API |
| 更新日志 | 版本发布说明 | 每次发版更新 |

帮助中心入口：顶部导航 "帮助" / 页面内 "?" 图标上下文帮助。

#### Step 3: 反馈处理

**反馈提交表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 反馈类型 | `feedback_type` | 下拉 | ✅ | bug / suggestion / complaint / other |
| 标题 | `title` | 文本 | ✅ | 5-100字符 |
| 详细描述 | `description` | 富文本 | ✅ | 10-5000字符 |
| 截图 | `screenshots` | 文件上传 | ❌ | ≤5张，每张≤5MB，PNG/JPG |
| 紧急程度 | `priority` | 下拉 | ✅ | high / medium / low |
| 联系方式 | `contact` | 文本 | ❌ | 邮箱或手机号 |

**反馈处理 SLA：**

| 反馈类型 | 响应时间 | 解决时间 | 处理流程 |
|----------|----------|----------|----------|
| Bug | ≤4h | ≤24h | 自动创建工单 → 分配开发 → 修复 → 验证 → 关闭 |
| 功能建议 | ≤1工作日 | ≤3工作日（评估回复） | 产品评估 → 纳入或拒绝 → 回复用户 |
| 投诉 | ≤2h | ≤1工作日 | 升级处理 → 专人跟进 → 解决 → 回访 |
| 其他 | ≤1工作日 | 视情况 | 分类 → 转交对应团队 |

### 系统响应

| 场景 | HTTP 状态 | 响应 |
|------|-----------|------|
| 反馈提交成功 | 201 | `{ "ticket_id": "TICKET-20260401-001", "status": "open" }` |
| 附件超限 | 400 | `{ "error": "FILE_TOO_LARGE" }` |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 客服全忙 | 自动留言，承诺 1h 内回复 |
| 反馈超 SLA 未处理 | 自动升级给上级管理员 |
| 文件上传失败 | 允许先提交文字，后续补充附件 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 反馈工单写入 `feedback_tickets` 表 |
| R2 | 用户收到提交确认通知 |
| R3 | 处理完成后用户收到结果通知 |

---

# 第六部分：模块5 — 异构资源纳管 🔴

> 对齐客户 PRD 第六部分，覆盖多源异构计算资源的接入、管理、调度和运维全流程。

---

## US-5.1: 计算节点接入

### 概述

平台支持三类计算资源接入：平台自有节点、合作云厂商节点（阿里云/腾讯云/华为云）和用户自有节点。通过 Agent 安装和兼容性验证确保节点可用。

### 前置条件

| # | 条件 |
|---|------|
| P1 | 操作者拥有节点管理权限（tenant_admin 及以上） |
| P2 | 目标节点可通过网络访问（公网 / VPN / 专线） |
| P3 | 目标节点满足最低硬件要求 |

### 三类资源接入 🆕

| 资源类型 | 来源 | 接入方式 | 审核要求 | 计费模式 |
|----------|------|----------|----------|----------|
| **平台自有** | 平台采购的物理/云服务器 | 管理员直接注册 | 无需审核 | 平台内部成本 |
| **合作云厂商** | 阿里云 / 腾讯云 / 华为云 | API 对接 + Agent 安装 | 平台审核（≤24h） | 按量付费 📅 Phase 2 |
| **用户自有** | 用户自建机房或云主机 | Agent 安装 + 兼容性验证 | 平台审核（≤24h） | 用户承担节点成本 |

### 操作步骤

#### Step 1: 选择接入方式

用户进入 "资源管理" → "接入节点"，选择接入方式：

| 接入方式 | 适用场景 | 流程 |
|----------|----------|------|
| **Agent 安装** | 所有类型节点 | 下载 Agent → 安装 → 注册 → 验证 |
| **云厂商 API** | 合作云厂商节点 | 填写 AccessKey → 选择实例 → 自动安装 Agent |
| **手动注册** | 特殊网络环境 | 填写节点信息 → 上传硬件报告 → 人工审核 |

#### Step 2: Agent 安装流程

```bash
# 1. 下载 Agent 安装包
curl -fsSL https://ahvp.example.com/agent/install.sh | bash

# 2. 配置注册信息
ahvp-agent config set \
  --server https://ahvp.example.com \
  --token <registration_token> \
  --tenant <tenant_id>

# 3. 启动 Agent
ahvp-agent start

# 4. 验证连接
ahvp-agent status
```

**Agent 安装表单（云厂商 API 方式）：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 云厂商 | `cloud_provider` | 下拉 | ✅ | aliyun / tencent / huawei |
| AccessKey ID | `access_key_id` | 文本 | ✅ | 加密存储 |
| AccessKey Secret | `access_key_secret` | 密码 | ✅ | 加密存储，不回显 |
| Region | `region` | 下拉 | ✅ | 云厂商 Region 列表 |
| 实例 ID | `instance_ids` | 多选 | ✅ | 自动拉取可用实例 |

#### Step 3: 硬件适配验证

Agent 安装后自动执行硬件检测：

| 检测项 | 最低要求 | 检测命令 | 说明 |
|--------|----------|----------|------|
| CPU | 4 核 | `nproc` | 评测引擎最低要求 |
| 内存 | 16 GB | `free -g` | 模型推理最低要求 |
| 磁盘 | 100 GB 可用 | `df -h` | 评测数据存储 |
| GPU（可选） | NVIDIA / 国产 AI 芯片 | `nvidia-smi` / 厂商工具 | 非 CPU-only 节点必须 |
| 网络 | 延迟 ≤100ms（到平台） | `ping` | 确保通信质量 |

#### Step 4: 软件适配验证

| 检测项 | 要求 | 说明 |
|--------|------|------|
| 操作系统 | Linux (Ubuntu 20.04+ / CentOS 7+) | 暂不支持 Windows |
| Docker | ≥20.10 | 评测引擎容器化运行 |
| Python | ≥3.8 | 评测脚本运行环境 |
| CUDA（GPU 节点） | ≥11.0 | NVIDIA GPU 驱动 |
| DIPU/DIOPI（国产芯片） | 最新稳定版 | DeepLink 适配层 |

#### Step 5: 兼容性验证

系统自动运行兼容性测试套件：

```
1. 基础连通性测试（Agent ↔ 平台通信）
2. 硬件信息采集（CPU/GPU/内存/磁盘完整信息）
3. 运行环境测试（Docker 拉取+运行基础镜像）
4. 评测引擎冒烟测试（执行一个简单 MatMul 算子评测）
5. 结果上报 → 生成兼容性报告
```

#### Step 6: 接入审核

| 节点来源 | 审核流程 | 审核 SLA |
|----------|----------|----------|
| 平台自有 | 自动通过 | 即时 |
| 云厂商 | 兼容性验证通过 → 自动审核 | ≤10min |
| 用户自有 | 兼容性验证 → 管理员人工审核 | ≤24h |

**节点注册表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 节点名称 | `node_name` | 文本 | ✅ | 2-100字符，租户内唯一 |
| 节点类型 | `node_type` | 下拉 | ✅ | cpu_only / gpu_nvidia / gpu_domestic / npu |
| 接入方式 | `access_type` | 下拉 | ✅ | platform / cloud / user_owned |
| IP 地址 | `ip_address` | 文本 | ✅ | 合法 IPv4/IPv6 |
| SSH 端口 | `ssh_port` | 数字 | ✅ | 1-65535，默认 22 |
| 标签 | `tags` | 多选 | ❌ | 自定义标签，用于资源检索 |
| 描述 | `description` | 文本 | ❌ | ≤500字符 |

### 系统响应

| 场景 | HTTP 状态 | 响应 |
|------|-----------|------|
| 节点注册成功 | 201 | `{ "node_id": "uuid", "status": "pending_verification" }` |
| 兼容性验证通过 | 200 | `{ "node_id": "uuid", "status": "active", "compatibility_report": {...} }` |
| 兼容性验证失败 | 200 | `{ "node_id": "uuid", "status": "verification_failed", "issues": [...] }` |
| 硬件不满足要求 | 400 | `{ "error": "HARDWARE_REQUIREMENT_NOT_MET", "details": [...] }` |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| Agent 安装失败 | 提供手动安装文档 + 诊断日志上传 |
| 网络不通 | 提示检查防火墙/安全组，提供排查指南 |
| 兼容性测试超时 | 重试一次，仍失败标记为需人工排查 |
| 云厂商 API 鉴权失败 | 提示检查 AccessKey 权限，需具备实例管理权限 |
| Agent 心跳丢失 | 5 次心跳（2min/次）未响应 → 标记节点离线 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 节点信息写入 `compute_nodes` 表 |
| R2 | 兼容性报告写入 `node_compatibility_reports` 表 |
| R3 | 节点加入对应资源池 |
| R4 | Agent 开始定期上报心跳和监控数据（30s 间隔） |
| R5 | 操作记录审计日志 |

---

## US-5.2: 资源池管理

### 概述

将已接入的计算节点组织为资源池，支持多维分类、配额管理和资源标签检索。

### 前置条件

| # | 条件 |
|---|------|
| P1 | 操作者拥有资源管理权限（tenant_admin 及以上） |
| P2 | 已有至少一个已验证的计算节点 |

### 操作步骤

#### Step 1: 资源池分类

| 分类维度 | 类别 | 说明 |
|----------|------|------|
| **按类型** | 算力池 / 存储池 / 网络池 | 按资源功能划分 |
| **按归属** | 自有池 / 云厂商池 / 用户共享池 | 按资源来源划分 |
| **按场景** | 精度测试池 / 性能测试池 / 模型推理池 / 通用池 | 按使用场景划分 |

**资源池创建表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 资源池名称 | `pool_name` | 文本 | ✅ | 2-100字符，租户内唯一 |
| 资源类型 | `resource_type` | 下拉 | ✅ | compute / storage / network |
| 归属类型 | `ownership` | 下拉 | ✅ | platform / cloud / user_shared |
| 场景标签 | `scenario` | 多选 | ❌ | accuracy / performance / inference / general |
| 描述 | `description` | 文本 | ❌ | ≤500字符 |
| 节点列表 | `node_ids` | 多选 | ✅ | 已验证的节点 |

#### Step 2: 配额管理

| 操作 | 说明 | 触发条件 |
|------|------|----------|
| **分配** | 为租户/用户分配资源池使用配额 | 管理员手动操作 |
| **调整** | 动态调整已分配配额 | 配额不足时申请 / 管理员主动调整 |
| **监控** | 实时监控配额使用率 | 使用率 >80% 触发告警 |
| **回收** | 释放长期未使用的配额 | 连续 30 天使用率 <5% |

**配额配置表：**

| 配额项 | 单位 | 默认值 | 上限 | 告警阈值 |
|--------|------|--------|------|----------|
| CPU 核数 | 核 | 32 | 1024 | 80% |
| GPU 数量 | 块 | 4 | 64 | 80% |
| 内存容量 | GB | 128 | 4096 | 85% |
| 存储容量 | GB | 500 | 10240 | 90% |
| 并发任务数 | 个 | 5 | 100 | — |

#### Step 3: 资源标签与检索

支持为资源池和节点添加自定义标签，便于快速检索：

| 标签维度 | 示例 | 说明 |
|----------|------|------|
| 芯片厂商 | `vendor:nvidia` / `vendor:cambricon` | 标识芯片品牌 |
| 芯片型号 | `model:A100` / `model:MLU370` | 标识具体型号 |
| 性能等级 | `tier:high` / `tier:medium` / `tier:low` | 性能分级 |
| 位置 | `region:beijing` / `region:shanghai` | 物理位置 |
| 用途 | `purpose:training` / `purpose:inference` | 使用场景 |

**检索 API：**

```
GET /api/v1/resource-pools?tags=vendor:nvidia,tier:high&type=compute&page=1&size=20
```

### 系统响应

| 场景 | HTTP 状态 | 响应 |
|------|-----------|------|
| 资源池创建成功 | 201 | `{ "pool_id": "uuid", "status": "active" }` |
| 配额调整成功 | 200 | `{ "quota": {...}, "usage": {...} }` |
| 配额超限 | 403 | `{ "error": "QUOTA_EXCEEDED" }` |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 资源池内所有节点离线 | 标记资源池为 degraded，通知管理员 |
| 配额使用率达到告警阈值 | 发送告警通知（邮件 + 站内信） |
| 删除非空资源池 | 拒绝删除，提示先迁移节点 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 资源池记录写入 `resource_pools` 表 |
| R2 | 节点-资源池映射写入 `pool_nodes` 表 |
| R3 | 配额配置生效 |
| R4 | 操作记录审计日志 |

---

## US-5.3: 智能调度与分配 🆕

### 概述

提供多策略的智能调度引擎，支持自动、手动和批量资源分配，具备容错和弹性扩缩能力。

### 前置条件

| # | 条件 |
|---|------|
| P1 | 已有可用的资源池和计算节点 |
| P2 | 评测任务已创建且状态为 QUEUED |

### 调度策略

| 策略名称 | 标识 | 说明 | 适用场景 |
|----------|------|------|----------|
| **优先级调度** | `priority` | 高优先级任务优先分配资源 | 紧急评测需求 |
| **资源匹配** | `resource_match` | 根据任务需求匹配最适合的节点（芯片类型、内存、算力） | 默认策略 |
| **负载均衡** | `load_balance` | 将任务均匀分配到各节点，避免热点 | 多任务并发 |
| **弹性调度** | `elastic` | 按需动态扩容/缩容云厂商节点 | 突发流量 📅 Phase 2 |
| **容错调度** | `fault_tolerant` | 优先选择健康度高的节点，避开故障节点 | 生产环境 |

### 操作步骤

#### Step 1: 调度请求

评测任务进入 QUEUED 状态后，调度引擎自动接管：

```
调度流程:
1. 解析任务资源需求（芯片类型、GPU 数量、内存、预估时长）
2. 筛选可用节点（状态=active，健康度>80%，配额充足）
3. 应用调度策略（默认：resource_match + fault_tolerant 组合）
4. 选择最优节点 → 锁定资源
5. 下发任务 → 更新任务状态为 RUNNING
```

#### Step 2: 分配方式

| 分配方式 | 说明 | 操作 |
|----------|------|------|
| **自动分配** | 调度引擎根据策略自动选择节点 | 默认行为，无需用户干预 |
| **手动分配** | 用户在创建评测时指定目标节点 | 评测创建表单选择"指定节点" |
| **批量分配** | 多个任务同时调度，全局优化分配 | 批量评测场景自动触发 |

**手动分配表单（评测创建时可选）：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 分配方式 | `allocation_mode` | 单选 | ✅ | auto / manual |
| 目标节点 | `target_node_id` | 下拉 | 条件必填（manual） | 仅显示满足任务需求的节点 |
| 调度策略 | `scheduling_strategy` | 下拉 | ❌ | priority / resource_match / load_balance |

#### Step 3: 容错机制

```
节点故障检测:
  Agent 心跳超时（>2min）
    → 标记节点为 unhealthy
    → 检查该节点上的运行中任务
    → 自动迁移任务到备用节点（保留检查点）
    → 从最近检查点恢复执行
    → 通知用户任务已迁移

备用节点选择:
  1. 优先选择同资源池内的健康节点
  2. 若同池无可用，扩展到其他资源池
  3. 若无可用节点，任务进入 QUEUED 等待
  4. 等待超过 30min → 通知用户
```

#### Step 4: 调度监控与优化

| 监控指标 | 说明 | 告警阈值 |
|----------|------|----------|
| 调度等待时间 | 任务从 QUEUED 到 RUNNING 的等待时间 | >10min 告警 |
| 资源利用率 | 全局 CPU/GPU/内存使用率 | >90% 告警 |
| 调度成功率 | 成功分配资源的任务占比 | <95% 告警 |
| 迁移次数 | 因故障迁移的任务数 | >5次/小时 告警 |

### 系统响应

| 场景 | 说明 | 通知方式 |
|------|------|----------|
| 调度成功 | 任务分配到节点并开始执行 | 更新任务状态 |
| 调度等待 | 无可用资源，任务排队 | 站内信提示预估等待时间 |
| 故障迁移 | 任务迁移到备用节点 | 邮件 + 站内信 |
| 调度失败 | 无任何可用节点 | 邮件告警 + 任务标记 FAILED |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 所有节点不可用 | 任务保持 QUEUED，每 5min 重试调度，30min 后通知用户 |
| 节点资源不足（运行时 OOM） | 标记任务 FAILED（EVAL-002），建议减小 batch size |
| 调度引擎自身故障 | 降级为 FIFO 简单调度，同时告警运维 |
| 迁移过程中目标节点也故障 | 任务回退到 QUEUED，选择其他节点 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 调度记录写入 `scheduling_logs` 表 |
| R2 | 资源锁定状态更新 |
| R3 | 任务状态从 QUEUED 变为 RUNNING |
| R4 | 故障迁移事件写入审计日志 |

---

## US-5.4: 资源监控与运维

### 概述

提供全维度的资源监控仪表盘、分级告警系统、故障检测与远程运维能力。

### 前置条件

| # | 条件 |
|---|------|
| P1 | 操作者拥有资源查看权限（engineer 及以上） |
| P2 | 已有接入的计算节点且 Agent 正常运行 |

### 操作步骤

#### Step 1: 全维度监控

**监控仪表盘（Dashboard）：**

| 监控维度 | 指标 | 采集频率 | 展示方式 |
|----------|------|----------|----------|
| **算力** | CPU 使用率、GPU 使用率、GPU 显存、TFLOPS | 30s | 实时折线图 |
| **存储** | 磁盘使用率、IOPS、读写延迟 | 60s | 仪表盘 + 趋势图 |
| **网络** | 带宽使用率、延迟、丢包率 | 30s | 实时折线图 |
| **温度** | CPU 温度、GPU 温度 | 30s | 仪表盘（颜色分级） |
| **任务** | 运行中任务数、队列长度、完成率 | 10s | 数字卡片 + 进度条 |

**刷新策略：** 页面自动刷新间隔 **30 秒**，用户可手动设置 10s/30s/60s/关闭。

#### Step 2: 告警分级 🆕

| 告警级别 | 标识 | 颜色 | 说明 | 通知方式 | 处理要求 |
|----------|------|------|------|----------|----------|
| **严重** | `critical` | 🔴 红色 | 服务不可用或数据有丢失风险 | 邮件 + 短信 + 站内信 | 立即处理 |
| **警告** | `warning` | 🟡 黄色 | 性能下降或接近阈值 | 邮件 + 站内信 | 4h 内处理 |
| **信息** | `info` | 🔵 蓝色 | 状态变更通知 | 站内信 | 知悉即可 |

**预置告警规则：**

| 告警名称 | 级别 | 触发条件 | 恢复条件 |
|----------|------|----------|----------|
| GPU 温度过高 | critical | GPU 温度 >85℃ | GPU 温度 <75℃ |
| 磁盘空间不足 | warning → critical | 使用率 >90% → >95% | 使用率 <85% |
| 节点离线 | critical | 心跳超时 >2min | 心跳恢复 |
| CPU 持续高负载 | warning | CPU >90% 持续 >10min | CPU <80% |
| 内存不足 | warning | 可用内存 <10% | 可用内存 >20% |
| 网络延迟高 | warning | 延迟 >200ms | 延迟 <100ms |
| 任务队列积压 | info → warning | 队列 >10 → >50 | 队列 <5 |

**自定义告警规则表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 告警名称 | `alert_name` | 文本 | ✅ | 2-100字符 |
| 监控指标 | `metric` | 下拉 | ✅ | CPU/GPU/内存/磁盘/网络等 |
| 触发条件 | `condition` | 表达式 | ✅ | 如 `gpu_temp > 85` |
| 持续时间 | `duration` | 数字 | ❌ | 满足条件持续 N 秒后触发 |
| 告警级别 | `severity` | 下拉 | ✅ | critical / warning / info |
| 通知方式 | `notify_channels` | 多选 | ✅ | email / sms / internal |
| 通知对象 | `notify_users` | 多选 | ✅ | 租户内用户列表 |

#### Step 3: 故障检测与处理

**故障检测 SLA：** ≤5 分钟

**故障分级：**

| 故障等级 | 影响范围 | 处理方式 | 恢复时间要求 |
|----------|----------|----------|-------------|
| **一级（P1）** | 影响全部/大部分用户，服务不可用 | 立即响应，全员告警，启动应急预案 | ≤30min |
| **二级（P2）** | 影响部分用户或功能降级 | 高优处理，通知相关负责人 | ≤2h |
| **三级（P3）** | 影响单个节点或个别任务 | 正常处理，自动迁移任务 | ≤24h |

**远程运维能力：**

| 运维操作 | 说明 | 权限要求 | 确认方式 |
|----------|------|----------|----------|
| 查看日志 | 远程查看节点 Agent 日志 | tenant_admin | 直接执行 |
| 重启 Agent | 远程重启节点上的 Agent 服务 | tenant_admin | 二次确认 |
| 系统信息 | 远程获取系统信息（top/df/nvidia-smi） | tenant_admin | 直接执行 |
| 清理磁盘 | 清理过期评测数据和临时文件 | tenant_admin | 二次确认 |

#### Step 4: 批量管理

| 操作 | 说明 | 适用场景 |
|------|------|----------|
| **批量重启** | 选中多个节点，统一重启 Agent | Agent 版本更新后 |
| **批量关机** | 选中多个节点，统一关机 | 节假日节能 |
| **批量更新** | 选中多个节点，统一更新 Agent 版本 | Agent 新版本发布 |
| **批量清理** | 选中多个节点，统一清理过期数据 | 定期运维 |

**批量操作采用灰度策略：** 先执行 10% 节点 → 确认无异常 → 执行剩余 90%

### 系统响应

| 场景 | 说明 | 响应 |
|------|------|------|
| 监控数据正常 | 实时展示监控指标 | Dashboard 数据刷新 |
| 触发告警 | 满足告警条件 | 创建告警记录 + 发送通知 |
| 告警恢复 | 恢复正常 | 标记告警为已恢复 + 发送恢复通知 |
| 远程操作成功 | 运维命令执行完成 | 返回执行结果 |

### 异常处理

| 异常场景 | 处理方式 |
|----------|----------|
| 监控数据采集失败 | Agent 本地缓存，网络恢复后批量上报 |
| 告警风暴（大量告警同时触发） | 告警聚合，合并为一条汇总告警 |
| 远程操作超时 | 30s 超时，提示检查节点连接状态 |
| 批量操作中途失败 | 停止后续操作，回报已完成和失败的节点列表 |

### 后置条件

| # | 条件 |
|---|------|
| R1 | 监控数据写入时序数据库（保留 90 天明细，1 年聚合） |
| R2 | 告警记录写入 `alerts` 表 |
| R3 | 运维操作记录审计日志 |
| R4 | 批量操作生成执行报告 |

---

# 第七部分：计费体系设计 🆕

> 📅 **Phase 2 实现。MVP 阶段所有功能免费使用。**

---

## 概述

AHVP 平台计费体系采用按量计费为主、预充值+信用额度的账户模式，覆盖评测任务、资产存储和高级报告三大计费场景。线下项目制（定制化评测、咨询服务）通过合同约定，不在平台在线计费体系中体现。

## 计费场景

| 场景 | 计费对象 | 计费单位 | 说明 |
|------|----------|----------|------|
| **自定义评测任务** | 评测过程消耗的计算资源 | CPU 时间 / GPU 时间 / 存储占用 | 按实际资源消耗计量 |
| **资产存储** | 评测数据、报告、模型文件 | 容量(GB) × 时间(天) | 超出免费额度后计费 |
| **高级报告** | 深度分析报告生成 | 按次 | 不同报告类型不同单价 |

## 计费模型

### 评测任务计费

```
任务费用 = CPU 时间(h) × CPU 单价 + GPU 时间(h) × GPU 单价 + 临时存储(GB·h) × 存储单价
```

| 资源类型 | 单价（参考） | 说明 |
|----------|-------------|------|
| CPU 计算 | ¥0.5 / 核·小时 | 按实际使用核数 × 时长 |
| GPU 计算（通用） | ¥5.0 / 卡·小时 | NVIDIA T4 等入门级 |
| GPU 计算（高端） | ¥20.0 / 卡·小时 | NVIDIA A100 等高端卡 |
| 国产 AI 芯片 | ¥8.0 / 卡·小时 | 寒武纪/昇腾等 |
| 临时存储 | ¥0.01 / GB·小时 | 评测过程中的中间数据 |

> **注意：** 以上单价为参考值，正式上线前根据运营策略调整。

### 资产存储计费

```
存储费用 = 存储容量(GB) × 天数 × 每 GB 每天单价
```

| 存储类型 | 免费额度 | 单价 | 说明 |
|----------|----------|------|------|
| 评测报告 | 10 GB | ¥0.003 / GB·天 | 报告 PDF、数据文件 |
| 评测数据 | 20 GB | ¥0.005 / GB·天 | 原始评测日志、中间数据 |
| 模型文件 | 5 GB | ¥0.005 / GB·天 | 上传的模型文件 |

### 高级报告计费

| 报告类型 | 单价 | 说明 |
|----------|------|------|
| 标准评测报告 | 免费 | 基础四维评分 + 雷达图 |
| 深度对比报告 | ¥50 / 次 | 多芯片深度对比分析 |
| 行业基准报告 | ¥200 / 次 | 行业对标 + 定制建议 |
| 定制分析报告 | 议价 | 专家定制分析 |

## 计费流程

```
┌───────────────────────────────────────────────────────────────┐
│                        计费流程                                │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  1. 任务创建                                                   │
│     ├── 系统根据任务配置预估资源消耗                              │
│     ├── 计算预估费用                                            │
│     └── 前端展示费用预估（含明细）                                │
│                                                               │
│  2. 用户确认                                                   │
│     ├── 用户确认费用                                            │
│     ├── 检查账户余额 / 信用额度                                  │
│     ├── 余额充足 → 冻结预估费用金额                               │
│     └── 余额不足 → 提示充值（BILL-001）                          │
│                                                               │
│  3. 任务执行                                                   │
│     ├── 实时采集资源使用量                                       │
│     ├── 每 5 分钟更新计量数据                                    │
│     └── 前端可查看实时费用                                       │
│                                                               │
│  4. 任务完成                                                   │
│     ├── 汇总实际资源消耗                                         │
│     ├── 计算实际费用                                            │
│     ├── 实际 < 预估 → 退还差额到余额                              │
│     ├── 实际 > 预估 → 差额从余额扣除                              │
│     └── 生成账单记录                                            │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## 账户体系

### 账户结构

| 账户组件 | 说明 |
|----------|------|
| **预充值余额** | 用户预先充值的金额，直接扣款 |
| **信用额度** | 平台授予的信用额度，余额不足时使用，月底结算 |
| **冻结金额** | 进行中任务的预估费用冻结 |
| **赠送余额** | 平台赠送的体验金，有有效期，优先扣除 |

**扣款优先级：** 赠送余额 → 预充值余额 → 信用额度

### 充值方式

| 方式 | 说明 | 到账时间 |
|------|------|----------|
| 支付宝 | 在线支付 | 即时 |
| 微信支付 | 在线支付 | 即时 |
| 银行转账 | 对公转账 | 1-3 工作日 |
| 合同预付 | 企业合同约定 | 合同签署后 |

### 账单管理

| 功能 | 说明 |
|------|------|
| 月度账单 | 每月 1 日生成上月账单，包含所有消费明细 |
| 账单详情 | 按任务/日期/资源类型查看消费明细 |
| 发票申请 | 支持增值税普通/专用发票 |
| 账单导出 | 导出 CSV / PDF 格式 |
| 消费趋势 | 可视化展示近 12 个月消费趋势 |

### 计费相关表单

**充值表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 充值金额 | `amount` | 数字 | ✅ | ≥100 元，精度到分 |
| 支付方式 | `payment_method` | 单选 | ✅ | alipay / wechat / bank_transfer |

**发票申请表单：**

| 字段 | 标识 | 类型 | 必填 | 校验规则 |
|------|------|------|------|----------|
| 发票类型 | `invoice_type` | 单选 | ✅ | ordinary / special |
| 抬头 | `title` | 文本 | ✅ | 2-200字符 |
| 纳税人识别号 | `tax_id` | 文本 | 条件必填（专票） | 15-20位 |
| 金额 | `amount` | 数字 | ✅ | ≤未开票余额 |
| 邮寄地址 | `address` | 文本 | 条件必填（纸质） | — |

## 线下项目制

| 项目 | 说明 |
|------|------|
| 适用范围 | 定制化评测方案、专家咨询、驻场服务 |
| 定价方式 | 线下商务洽谈，签订正式合同 |
| 计费方式 | 合同约定付款节点，不在平台在线计费中体现 |
| 交付物 | 定制报告、技术方案、评测环境搭建等 |

---

# 第八部分：页面详细设计

## 导航结构

扩展为 **8 个一级导航**：

```
┌─────────────────────────────────────────────────────────┐
│  🏠 工作台  │  📊 芯片管理  │  🔬 评测中心  │  📋 报告中心  │
│  💻 资源管理  │  👥 用户管理  │  💰 计费中心  │  🏛 社区      │
└─────────────────────────────────────────────────────────┘
```

### 一级导航 - 二级页面映射

| 一级导航 | 二级页面 | MVP 阶段 | 说明 |
|----------|----------|----------|------|
| **🏠 工作台** | Dashboard | ✅ | 概览面板：芯片数、评测数、最近活动 |
| | 快速开始 | ✅ | 引导新用户快速上手 |
| | 通知中心 | ✅ | 站内消息通知 |
| **📊 芯片管理** | 芯片列表 | ✅ | 支持搜索/筛选/排序 |
| | 注册芯片 | ✅ | 步骤向导式注册 |
| | 芯片详情/档案页 | ✅ | 六 Tab 详情页 |
| | 芯片对比 | MVP-1 | 多芯片雷达图对比 |
| **🔬 评测中心** | 评测列表 | ✅ | 评测计划管理 |
| | 创建评测 | ✅ | 三步向导 |
| | 模板管理 | ✅ | 预设 + 自定义模板 |
| | 评测详情 | ✅ | 进度/日志/结果 |
| **📋 报告中心** | 报告列表 | ✅ | 所有评测报告 |
| | 报告详情 | ✅ | 7 板块完整报告 |
| | 报告导出 | MVP-1 | PDF 下载 |
| **💻 资源管理** | 节点列表 | ✅ | 计算节点管理 |
| | 资源池管理 | ✅ | 资源池 CRUD |
| | 监控仪表盘 | ✅ | 实时监控 |
| | 告警管理 | ✅ | 告警规则和历史 |
| **👥 用户管理** | 个人设置 | ✅ | 基础设置 |
| | 成员管理 | Phase 2 | 租户成员 |
| | 角色权限 | Phase 2 | RBAC 管理 |
| | 审计日志 | Phase 2 | 操作审计 |
| **💰 计费中心** | 账户总览 | 📅 Phase 2 | 余额/消费概览 |
| | 消费明细 | 📅 Phase 2 | 按任务/日期明细 |
| | 充值 | 📅 Phase 2 | 在线充值 |
| | 发票管理 | 📅 Phase 2 | 开票申请 |
| **🏛 社区** | 讨论区 | 📅 Phase 2 | 帖子列表 |
| | 需求对接 | 📅 Phase 3 | 芯片厂商-用户对接 |
| | 排行榜 | 📅 Phase 3 | 芯片性能排行 |

### 核心页面 Wireframe

#### Dashboard（工作台首页）

```
┌──────────────────────────────────────────────────┐
│  AHVP 智能硬件验证平台            [通知🔔] [头像]  │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│  │芯片数 │  │评测数 │  │运行中 │  │报告数 │        │
│  │  12   │  │  48   │  │  3   │  │  45  │        │
│  └──────┘  └──────┘  └──────┘  └──────┘        │
│                                                  │
│  ┌─ 最近评测 ──────────────┐  ┌─ 资源概览 ────┐  │
│  │ ▪ MatMul-A100  运行中   │  │  CPU  ███░ 72% │  │
│  │ ▪ Conv2d-MLU   已完成   │  │  GPU  █████ 95% │  │
│  │ ▪ 精度测试-910B 已完成  │  │  存储 ██░░ 45% │  │
│  │ ▪ 推理-T4     排队中    │  │  任务  3/5     │  │
│  └─────────────────────────┘  └───────────────┘  │
│                                                  │
│  ┌─ 芯片评分概览 ─────────────────────────────┐  │
│  │  [雷达图: 计算性能/访存性能/算子兼容/模型性能]  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

#### 芯片档案页（六 Tab）

```
┌──────────────────────────────────────────────────┐
│  ← 返回   NVIDIA A100 80GB                      │
│  状态: EVALUATED  评分: ⭐⭐⭐⭐⭐ 92.3            │
├──────────────────────────────────────────────────┤
│  [概览] [评测记录] [性能数据] [兼容性] [报告] [设置]│
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─ 基本信息 ────┐  ┌─ 综合评分 ────────────┐    │
│  │ 厂商: NVIDIA  │  │                       │    │
│  │ 架构: Ampere  │  │    [雷达图]            │    │
│  │ 制程: 7nm     │  │                       │    │
│  │ 显存: 80GB    │  │  计算: 95  访存: 88    │    │
│  │ 接口: PCIe4.0 │  │  兼容: 91  模型: 94    │    │
│  └───────────────┘  └───────────────────────┘    │
│                                                  │
│  ┌─ 最近评测 ────────────────────────────────┐   │
│  │ 日期        模板          状态    评分     │   │
│  │ 2026-04-01  算子性能      完成    92.3    │   │
│  │ 2026-03-28  精度测试      完成    91.0    │   │
│  │ 2026-03-25  模型推理      完成    94.1    │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

#### 评测创建三步向导

```
Step 1: 选择芯片           Step 2: 配置评测          Step 3: 确认执行
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 🔍 搜索芯片    │     │ 模板: [算子性能 ▼] │     │ 芯片: A100 80GB   │
│              │     │                  │     │ 模板: 算子性能     │
│ ☑ A100 80GB  │     │ 算子选择:         │     │ 算子: 12个        │
│ ☐ MLU370-X8  │     │ ☑ MatMul         │     │ 预估: ~15分钟     │
│ ☐ 昇腾910B   │     │ ☑ Conv2d         │     │                  │
│              │     │ ☑ GEMM           │     │ 费用预估:         │
│              │     │ ...              │     │ GPU: ¥5.0 (预估)  │
│              │     │                  │     │                  │
│    [下一步 →] │     │   [← 上一步] [→] │     │ [← 上一步] [提交] │
└──────────────┘     └──────────────────┘     └──────────────────┘
```

---

# 第九部分：数据模型设计

## 核心表一览

### 现有表（v2.1 保留）

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| `users` | 用户表 | id, username, email, password_hash, user_type, role, status |
| `chips` | 芯片表 | id, tenant_id, name, vendor, architecture, status, overall_score |
| `evaluation_plans` | 评测计划 | id, tenant_id, chip_id, template_id, status, created_by |
| `evaluation_tasks` | 评测任务 | id, plan_id, node_id, test_item, status, result |
| `evaluation_results` | 评测结果 | id, task_id, metrics (JSON), score |
| `reports` | 评测报告 | id, plan_id, chip_id, report_data (JSON), created_at |
| `templates` | 评测模板 | id, name, type, config (JSON), is_preset |
| `compute_nodes` | 计算节点 | id, tenant_id, name, type, status, ip_address |
| `resource_pools` | 资源池 | id, tenant_id, name, type, ownership |
| `audit_logs` | 审计日志 | id, tenant_id, user_id, action, resource_type, resource_id, details |

### 新增表

#### tenants（租户表）

```sql
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_name     VARCHAR(100) NOT NULL UNIQUE,
    tenant_slug     VARCHAR(50) NOT NULL UNIQUE,
    description     TEXT,
    contact_name    VARCHAR(50) NOT NULL,
    contact_email   VARCHAR(255) NOT NULL,
    contact_phone   VARCHAR(20),
    industry        VARCHAR(50),
    owner_id        UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active/frozen/deactivated
    max_chips       INTEGER NOT NULL DEFAULT 20,
    max_concurrent_tasks INTEGER NOT NULL DEFAULT 5,
    max_storage_gb  INTEGER NOT NULL DEFAULT 100,
    max_members     INTEGER NOT NULL DEFAULT 50,
    expires_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_owner ON tenants(owner_id);
CREATE INDEX idx_tenants_status ON tenants(status);
```

#### tenant_members（租户成员表）

```sql
CREATE TABLE tenant_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    role_id         UUID NOT NULL REFERENCES roles(id),
    department      VARCHAR(100),
    joined_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    invited_by      UUID REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active/inactive
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user ON tenant_members(user_id);
```

#### roles（角色表）

```sql
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id),  -- NULL 表示全局预置角色
    role_name       VARCHAR(50) NOT NULL,
    role_desc       TEXT,
    parent_role_id  UUID REFERENCES roles(id),
    is_preset       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, role_name)
);
```

#### role_permissions（角色权限表）

```sql
CREATE TABLE role_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission      VARCHAR(100) NOT NULL,  -- 如 'chip:create', 'evaluation:execute'
    UNIQUE(role_id, permission)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
```

#### billing_accounts（计费账户表）📅 Phase 2

```sql
CREATE TABLE billing_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) UNIQUE,
    balance         DECIMAL(12, 2) NOT NULL DEFAULT 0.00,     -- 预充值余额
    credit_limit    DECIMAL(12, 2) NOT NULL DEFAULT 0.00,     -- 信用额度
    credit_used     DECIMAL(12, 2) NOT NULL DEFAULT 0.00,     -- 已用信用
    frozen_amount   DECIMAL(12, 2) NOT NULL DEFAULT 0.00,     -- 冻结金额
    gift_balance    DECIMAL(12, 2) NOT NULL DEFAULT 0.00,     -- 赠送余额
    gift_expires_at TIMESTAMP WITH TIME ZONE,                  -- 赠送余额过期时间
    status          VARCHAR(20) NOT NULL DEFAULT 'active',     -- active/frozen/closed
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

#### billing_records（计费记录表）📅 Phase 2

```sql
CREATE TABLE billing_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    account_id      UUID NOT NULL REFERENCES billing_accounts(id),
    record_type     VARCHAR(20) NOT NULL,   -- charge/deduct/refund/freeze/unfreeze/gift
    amount          DECIMAL(12, 2) NOT NULL,
    balance_after   DECIMAL(12, 2) NOT NULL,
    related_task_id UUID REFERENCES evaluation_tasks(id),
    description     TEXT,
    payment_method  VARCHAR(20),             -- alipay/wechat/bank_transfer/credit/gift
    invoice_status  VARCHAR(20) DEFAULT 'none',  -- none/pending/issued
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_records_tenant ON billing_records(tenant_id);
CREATE INDEX idx_billing_records_type ON billing_records(record_type);
CREATE INDEX idx_billing_records_date ON billing_records(created_at);
```

#### community_posts（社区帖子表）📅 Phase 2

```sql
CREATE TABLE community_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id       UUID NOT NULL REFERENCES users(id),
    tenant_id       UUID REFERENCES tenants(id),
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    category        VARCHAR(50) NOT NULL,    -- discussion/question/announcement/showcase
    tags            VARCHAR(500),             -- 逗号分隔标签
    view_count      INTEGER NOT NULL DEFAULT 0,
    like_count      INTEGER NOT NULL DEFAULT 0,
    comment_count   INTEGER NOT NULL DEFAULT 0,
    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    is_closed       BOOLEAN NOT NULL DEFAULT FALSE,
    status          VARCHAR(20) NOT NULL DEFAULT 'published',  -- draft/published/hidden/deleted
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_posts_author ON community_posts(author_id);
CREATE INDEX idx_community_posts_category ON community_posts(category);
CREATE INDEX idx_community_posts_created ON community_posts(created_at DESC);
```

#### community_comments（社区评论表）📅 Phase 2

```sql
CREATE TABLE community_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id         UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id),
    parent_id       UUID REFERENCES community_comments(id),  -- 支持嵌套回复
    content         TEXT NOT NULL,
    like_count      INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'published',
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_comments_post ON community_comments(post_id);
CREATE INDEX idx_community_comments_author ON community_comments(author_id);
```

#### user_points（用户积分表）📅 Phase 3

```sql
CREATE TABLE user_points (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    points          INTEGER NOT NULL DEFAULT 0,
    level           INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE point_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    points_change   INTEGER NOT NULL,         -- 正数增加，负数减少
    balance_after   INTEGER NOT NULL,
    reason          VARCHAR(50) NOT NULL,      -- evaluation_complete/post_liked/daily_login/...
    related_id      UUID,                      -- 关联的评测/帖子等 ID
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_point_transactions_user ON point_transactions(user_id);
CREATE INDEX idx_point_transactions_date ON point_transactions(created_at);
```

**积分规则（Phase 3）：**

| 行为 | 积分 | 频率限制 |
|------|------|----------|
| 每日登录 | +5 | 每日一次 |
| 完成评测 | +20 | 无限制 |
| 发表帖子 | +10 | 每日≤5次 |
| 帖子被点赞 | +2 | — |
| 回答问题 | +5 | 每日≤10次 |
| 分享报告 | +15 | — |

### ER 关系图（文本）

```
users ──1:N──> tenant_members ──N:1──> tenants
users ──1:N──> chips
users ──1:N──> evaluation_plans
users ──1:N──> community_posts
users ──1:1──> user_points

tenants ──1:N──> tenant_members
tenants ──1:N──> chips
tenants ──1:N──> compute_nodes
tenants ──1:N──> resource_pools
tenants ──1:1──> billing_accounts
tenants ──1:N──> billing_records
tenants ──1:N──> roles

roles ──1:N──> role_permissions
roles ──1:N──> tenant_members
roles ──自引用──> roles (parent_role_id)

chips ──1:N──> evaluation_plans
evaluation_plans ──1:N──> evaluation_tasks
evaluation_tasks ──1:N──> evaluation_results
evaluation_plans ──1:1──> reports

community_posts ──1:N──> community_comments
community_comments ──自引用──> community_comments (parent_id)

compute_nodes ──N:M──> resource_pools (via pool_nodes)
```

---

# 第十部分：分期交付计划

## 总体规划

```
2026.05 ──── 2026.06 ──── 2026.07 ──── 2026.08 ──── 2026.09 ──── 2026.12
  │           │            │            │            │            │
  ├── MVP-0 ──┤            │            │            │            │
  │           ├── MVP-1 ───┤            │            │            │
  │           │            ├──── Phase 2 ────────────┤            │
  │           │            │                         ├── Phase 3 ─┤
```

## MVP-0（2026.05 - 2026.06）

**目标：** 注册芯片 → 创建评测 → 执行 → 报告全流程跑通

| 模块 | 交付内容 | 优先级 | 验收标准 |
|------|---------|--------|----------|
| **芯片管理** | 芯片 CRUD + 档案页 | P0 | 完成芯片注册、编辑、查看、删除全流程 |
| **评测管理** | 评测向导 + 3 预设模板 | P0 | 三步向导创建评测，3 个预设模板可用 |
| **评测引擎** | CPU 评测引擎 | P0 | 在 CPU 节点上完成 MatMul/Conv2d 等基础算子性能评测 |
| **评分体系** | 四维评分 + 雷达图 | P0 | 计算性能/访存性能/算子兼容/模型性能四维得分及可视化 |
| **报告** | 基础评测报告 | P0 | 报告生成并可在线查看 |
| **工作台** | Dashboard | P0 | 概览面板展示核心指标 |
| **用户** | 基础注册/登录 | P0 | 邮箱注册 + 密码登录 |
| **资源** | 单节点管理 | P0 | 至少 1 个 CPU 节点接入并可执行评测 |

**技术里程碑：**
- Week 1-2：后端 API 骨架 + 数据库建表 + 前端项目搭建
- Week 3-4：芯片 CRUD + 评测向导 UI
- Week 5-6：CPU 评测引擎 + 四维评分算法
- Week 7-8：报告生成 + Dashboard + 联调测试 + Bug 修复

## MVP-1（2026.06 - 2026.07）

**目标：** 完善报告体系和芯片对比能力

| 模块 | 交付内容 | 优先级 | 验收标准 |
|------|---------|--------|----------|
| **芯片对比** | 芯片对比页 | P0 | 支持 2-4 颗芯片多维度对比，含雷达图叠加 |
| **报告增强** | 完整评价报告（7 板块） | P0 | 总览/性能/精度/模型/兼容/历史/建议 7 个板块 |
| **报告导出** | PDF 下载 | P0 | 一键导出完整报告 PDF |
| **模板管理** | 模板管理完善 | P1 | 自定义模板创建/编辑/复制/删除 |
| **评测增强** | 评测日志增强 | P1 | 实时日志流 + 历史日志查询 |

**技术里程碑：**
- Week 1-2：芯片对比 API + 前端对比页
- Week 3-4：7 板块报告模板 + PDF 生成引擎
- Week 5-6：模板管理 CRUD + 评测日志增强
- Week 7-8：联调测试 + 性能优化 + Bug 修复

## Phase 2（2026.07 - 2026.09）

**目标：** GPU/NPU 真机评测 + 用户体系 + 计费体系

| 模块 | 交付内容 | 优先级 | 验收标准 |
|------|---------|--------|----------|
| **评测深度** | 100+ 算子精度测试 | P0 | DeepLink 22 类算子精度验证覆盖 |
| **模型评测** | 24 模型评测 | P0 | ResNet/BERT/GPT-2 等 24 个模型推理评测 |
| **真机评测** | GPU/NPU 真机评测 | P0 | 通过 DIPU/DIOPI 适配国产 AI 芯片 |
| **评分升级** | 六维评分 | P0 | 新增通信性能 + 生态成熟度两个维度 |
| **编排系统** | 自主编排系统 | P1 | 用户可自定义评测流程编排 |
| **用户体系** | 多租户 + RBAC | P0 | 租户隔离 + 六大角色 + 权限矩阵 |
| **计费体系** | 计费上线 | P1 | 按量计费 + 充值 + 账单 |
| **社区** | 社区基础功能 | P2 | 发帖/评论/点赞 |

**技术里程碑：**
- Month 1：DIPU/DIOPI 适配 + 算子精度测试框架
- Month 2：多租户后端 + RBAC + 模型评测引擎 + 六维评分
- Month 3：计费系统 + 社区功能 + 全量联调测试

## Phase 3（2026.09 - 2026.12）

**目标：** 大模型评测 + 分布式 + 生态运营

| 模块 | 交付内容 | 优先级 | 验收标准 |
|------|---------|--------|----------|
| **大模型评测** | LLM 评测能力 | P0 | 支持 LLaMA/ChatGLM 等大模型评测 |
| **分布式** | 多节点分布式评测 | P0 | 跨节点并行评测 + 结果聚合 |
| **资源运营** | 资源市场化运营 | P1 | 用户可共享闲置资源获取收益 |
| **社区完善** | 积分 + 需求对接 + 行业标准 | P1 | 积分体系 + 厂商-用户需求对接板块 |
| **用户画像** | 画像 + 推荐 | P2 | 用户行为画像 + 个性化推荐 |
| **DeepLink** | 数据收集表导出 | P1 | AHVP 数据 → DeepLink CSV 格式导出 |

**技术里程碑：**
- Month 1：大模型评测框架 + 分布式调度引擎
- Month 2：资源市场 + 社区积分 + 需求对接
- Month 3：用户画像 + DeepLink 导出 + 全面测试 + 上线运营

## 交付质量要求

| 维度 | 要求 |
|------|------|
| **测试覆盖** | 单元测试 ≥80%，集成测试覆盖核心流程 |
| **性能** | API 响应 P95 ≤200ms，页面加载 ≤2s |
| **可用性** | 目标 SLA ≥99.5%（Phase 2 起） |
| **安全** | 通过 OWASP Top 10 安全检查 |
| **文档** | 每个迭代交付 API 文档 + 用户手册更新 |

---

# 附录

---

## 附录A: DeepLink 算子清单

> 保留 v2.1 完整内容。以下为摘要。

AHVP 评测体系覆盖 DeepLink 定义的 **22 类、414+ 算子**，作为国产 AI 芯片算子兼容性和性能评测的基准：

| # | 算子类别 | 代表算子 | 数量 | 评测维度 |
|---|---------|---------|------|----------|
| 1 | BLAS 线性代数 | MatMul, GEMM, BatchMatMul | 15+ | 性能 + 精度 |
| 2 | 卷积 | Conv2d, Conv3d, ConvTranspose | 12+ | 性能 + 精度 |
| 3 | 池化 | MaxPool, AvgPool, AdaptivePool | 10+ | 性能 + 精度 |
| 4 | 激活函数 | ReLU, GELU, SiLU, Sigmoid, Tanh | 20+ | 性能 + 精度 |
| 5 | 归一化 | BatchNorm, LayerNorm, GroupNorm | 8+ | 性能 + 精度 |
| 6 | 损失函数 | CrossEntropy, MSE, NLLLoss | 10+ | 精度 |
| 7 | 优化器 | SGD, Adam, AdamW | 6+ | 精度 |
| 8 | 数据搬运 | Transpose, Reshape, Permute, Contiguous | 15+ | 性能 |
| 9 | 索引操作 | Index, Gather, Scatter, Embedding | 12+ | 性能 + 精度 |
| 10 | 逐元素运算 | Add, Mul, Div, Pow, Exp, Log | 25+ | 性能 + 精度 |
| 11 | 归约运算 | Sum, Mean, Max, Min, ArgMax | 12+ | 性能 + 精度 |
| 12 | 比较运算 | Equal, Greater, Less, Where | 8+ | 精度 |
| 13 | 排序 | Sort, TopK, ArgSort | 5+ | 性能 + 精度 |
| 14 | 注意力机制 | ScaledDotProduct, MultiHeadAttention, FlashAttention | 8+ | 性能 + 精度 |
| 15 | RNN | LSTM, GRU, RNNCell | 6+ | 性能 + 精度 |
| 16 | 随机数 | Uniform, Normal, Bernoulli, Dropout | 8+ | 精度 |
| 17 | 张量创建 | Zeros, Ones, Full, Arange, Linspace | 10+ | 精度 |
| 18 | 类型转换 | Cast, To, Float, Half, BFloat16 | 8+ | 精度 |
| 19 | 通信算子 | AllReduce, AllGather, ReduceScatter, Broadcast | 10+ | 性能 |
| 20 | 量化算子 | Quantize, Dequantize, FakeQuantize | 6+ | 精度 |
| 21 | 自定义算子 | CustomKernel, FusedOp | 可扩展 | 性能 + 精度 |
| 22 | 图像处理 | Resize, CropResize, NMS, ROIAlign | 15+ | 性能 + 精度 |

> 完整算子列表详见 DeepLink 官方仓库：https://github.com/DeepLink-org/deeplink.framework

---

## 附录B: MLPerf Inference v5.0 对标

> 保留 v2.1 完整内容。以下为摘要。

### 对标模型

| # | 模型 | 任务类型 | 场景 | 指标 |
|---|------|---------|------|------|
| 1 | ResNet-50 v1.5 | 图像分类 | Server / Offline | 吞吐(samples/s) + 延迟(ms) |
| 2 | BERT-Large | NLP 问答 | Server / Offline | 吞吐 + 延迟 |
| 3 | GPT-J 6B | 文本生成 | Server / Offline | Token 吞吐(tokens/s) |
| 4 | Stable Diffusion XL | 图像生成 | Offline | 吞吐(images/s) |
| 5 | Llama 2 70B | 文本生成 | Server / Offline | Token 吞吐 |
| 6 | 3D-UNet | 医学影像分割 | Offline | 吞吐 |
| 7 | RetinaNet | 目标检测 | Server / Offline | 吞吐 + mAP |
| 8 | DLRM v2 | 推荐系统 | Server / Offline | 吞吐 |

### 评测配置

| 场景 | 说明 | 约束 |
|------|------|------|
| Server | 模拟在线推理服务 | 按泊松分布发送请求，满足延迟 SLA |
| Offline | 模拟离线批处理 | 一次性加载全部数据，最大化吞吐 |

### AHVP 对标策略

- MVP 阶段：支持 ResNet-50、BERT-Large、GPT-J 等基础模型评测
- Phase 2：扩展至全部 8+ 模型 + 24 模型完整评测
- Phase 3：引入大模型（LLaMA/ChatGLM）和分布式评测

---

## 附录C: 状态机

### 芯片状态机 🆕

```
                    ┌───────────────┐
                    │  REGISTERED   │  已注册，未配置软件栈
                    └───────┬───────┘
                            │ 开始配置
                            ▼
                    ┌───────────────┐
                    │  CONFIGURING  │  正在配置/适配中
                    └───────┬───────┘
                            │ 配置完成
                            ▼
              ┌────►┌───────────────┐
              │     │     READY     │  就绪，可创建评测
              │     └───────┬───────┘
              │             │ 开始评测
              │             ▼
              │     ┌───────────────┐
              │     │  EVALUATING   │  评测中
              │     └───┬───────┬───┘
              │         │       │
              │  完成率≥80%   完成率<50%
              │         │       │
              │         ▼       ▼
              │  ┌──────────┐ ┌─────────────┐
              │  │ EVALUATED │ │ EVAL_FAILED │
              │  └────┬─────┘ └──────┬──────┘
              │       │              │
              │       │     修复后重评 │
              │       │              │
              │       │    ┌─────────┘
              │       │    │
              │       ▼    ▼
              │  ┌──────────┐
              └──┤  READY   │  （可再次评测）
                 └──────────┘
                      │
                      │ 归档/退役
                      ▼
                 ┌──────────┐
                 │ ARCHIVED │  已归档/退役
                 └──────────┘
```

**状态说明：**

| 状态 | 标识 | 说明 | 可执行操作 |
|------|------|------|-----------|
| 已注册 | `REGISTERED` | 已注册，未配置软件栈 | 编辑信息、开始配置 |
| 配置中 | `CONFIGURING` | 正在配置驱动/环境/适配层 | 查看配置进度 |
| 就绪 | `READY` | 配置完成，可创建评测 | 创建评测、编辑信息 |
| 评测中 | `EVALUATING` | 正在执行评测任务 | 查看进度、取消评测 |
| 已评测 | `EVALUATED` | 至少一次评测完成率 ≥80% | 查看报告、再次评测、对比 |
| 评测失败 | `EVAL_FAILED` | 评测完成率 <50% | 查看日志、修复后重评 |
| 已归档 | `ARCHIVED` | 已归档/退役，不可操作 | 仅查看历史数据 |

### 评测计划状态机

```
┌─────────┐    提交    ┌─────────┐   排队   ┌────────┐   执行   ┌─────────┐
│  DRAFT  │ ────────► │ PENDING │ ───────► │ QUEUED │ ──────► │ RUNNING │
└─────────┘           └─────────┘          └────────┘         └────┬────┘
                                                                   │
                                              ┌────────────────────┼────────────────┐
                                              │                    │                │
                                              ▼                    ▼                ▼
                                        ┌───────────┐      ┌──────────┐     ┌───────────┐
                                        │ COMPLETED │      │  FAILED  │     │ CANCELLED │
                                        └───────────┘      └──────────┘     └───────────┘
```

| 状态 | 说明 | 触发条件 |
|------|------|----------|
| DRAFT | 草稿，可编辑 | 用户创建但未提交 |
| PENDING | 待审核/待确认 | 用户提交评测计划 |
| QUEUED | 已入队，等待资源 | 审核通过 / 资源预估通过 |
| RUNNING | 执行中 | 调度引擎分配资源并开始执行 |
| COMPLETED | 已完成 | 所有任务执行完毕 |
| FAILED | 失败 | 超过阈值的任务失败 |
| CANCELLED | 已取消 | 用户手动取消 |

### 评测任务状态机

```
┌─────────┐   ┌────────┐   ┌─────────┐
│ PENDING │──►│ QUEUED │──►│ RUNNING │
└─────────┘   └────────┘   └────┬────┘
                                │
                 ┌──────────────┼──────────────┬────────────┐
                 │              │              │            │
                 ▼              ▼              ▼            ▼
          ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐
          │ COMPLETED │  │  FAILED  │  │ TIMEOUT  │  │ SKIPPED │
          └───────────┘  └──────────┘  └─────┬────┘  └─────────┘
                                             │
                                             ▼
                                       ┌──────────┐
                                       │ RETRYING │──► QUEUED（重新排队）
                                       └──────────┘
                                     （超过 max_retries → FAILED）
```

| 状态 | 说明 | 触发条件 |
|------|------|----------|
| PENDING | 待处理 | 评测计划创建任务 |
| QUEUED | 已排队 | 等待调度分配 |
| RUNNING | 执行中 | 节点开始执行 |
| COMPLETED | 已完成 | 执行成功 |
| FAILED | 失败 | 执行异常（OOM/NaN 等） |
| TIMEOUT | 超时 | 超过配置的超时时间 |
| RETRYING | 重试中 | 超时/失败后自动重试（≤max_retries） |
| SKIPPED | 已跳过 | 前置依赖失败（如精度不过跳过性能测试） |

---

## 附录D: 评分算法

### MVP 四维评分

| 维度 | 标识 | 数据来源 | 权重 |
|------|------|---------|------|
| 计算性能 | `compute_perf` | MatMul/Conv2d/GEMM score 加权均值 | **30%** |
| 访存性能 | `memory_perf` | Transpose/Embedding/Reshape score | **20%** |
| 算子兼容 | `op_compat` | 精度通过率 × 100 | **25%** |
| 模型性能 | `model_perf` | 推理/训练吞吐 vs 基准比值 × 100 | **25%** |

### 算子评分公式

```
单算子评分:
  score_i = baseline_latency_i / test_latency_i

  其中:
    - baseline_latency_i: 基准芯片（如 NVIDIA A100）在该算子上的延迟
    - test_latency_i: 被测芯片在该算子上的延迟
    - score > 1: 被测芯片优于基准
    - score < 1: 被测芯片弱于基准
    - score = 1: 与基准持平
```

### 维度评分公式

```
维度评分:
  dim_score = Σ(weight_i × score_i) / Σ(weight_i) × 100

  其中:
    - weight_i: 第 i 个算子在该维度内的权重（按重要性/使用频率分配）
    - score_i: 第 i 个算子的评分
    - 结果范围: 0-200+（理论无上限，但通常在 0-150 之间）
    - 归一化: 展示时 cap 到 100 分制（超过 100 显示 100+）
```

### 综合评分公式

```
综合评分:
  overall = Σ(dim_weight_j × dim_score_j)

  MVP 计算:
  overall = 0.30 × compute_perf + 0.20 × memory_perf + 0.25 × op_compat + 0.25 × model_perf
```

### Phase 2 六维评分 📅

| 维度 | 标识 | 数据来源 | MVP 权重 | Phase 2 权重 |
|------|------|---------|----------|-------------|
| 计算性能 | `compute_perf` | MatMul/Conv2d/GEMM score | 30% | **25%** |
| 访存性能 | `memory_perf` | Transpose/Embedding/Reshape score | 20% | **15%** |
| 算子兼容 | `op_compat` | 精度通过率 × 100 | 25% | **20%** |
| 模型性能 | `model_perf` | 推理/训练吞吐 vs 基准 | 25% | **15%** |
| 通信性能 | `comm_perf` 🆕 | AllReduce/AllGather 带宽效率 | — | **15%** |
| 生态成熟 | `ecosystem` 🆕 | DIPU 适配度 + 算子覆盖率 + 文档完整度 | — | **10%** |

### 评级标准

| 综合评分 | 评级 | 星级 | 说明 |
|----------|------|------|------|
| ≥90 | 卓越 | ⭐⭐⭐⭐⭐ | 全面超越或接近基准芯片 |
| 75-89 | 优秀 | ⭐⭐⭐⭐ | 大部分维度表现优秀 |
| 60-74 | 良好 | ⭐⭐⭐ | 基本满足使用要求 |
| <60 | 待改进 | ⭐⭐ | 存在明显短板，需优化 |

---

## 附录E: 错误码体系 🆕

### 错误码命名规范

```
格式: {MODULE}-{NUMBER}
MODULE: EVAL（评测）/ NODE（节点）/ AUTH（认证）/ BILL（计费）/ SYS（系统）
NUMBER: 三位数字，按模块分段分配
```

### 完整错误码表

| 错误码 | 模块 | 描述 | 用户提示 | HTTP 状态 | 处理方式 |
|--------|------|------|---------|-----------|---------|
| **EVAL-001** | 评测 | 任务执行超时 | "评测任务超时，请重试或增加超时时间" | 408 | 自动重试（max_retries 次） |
| **EVAL-002** | 评测 | OOM 内存溢出 | "内存不足，请减小 batch size 或 shape" | 500 | 标记 FAILED，记录详情 |
| **EVAL-003** | 评测 | NaN/Inf 检测 | "数值异常，请检查算子实现" | 500 | 标记 FAILED，记录异常值 |
| **EVAL-004** | 评测 | 精度不达标 | "精度未通过阈值，对应性能测试已跳过" | 200 | FAIL + 跳过该算子性能测试 |
| **EVAL-005** | 评测 | 基准数据缺失 | "缺少基准芯片数据，无法创建评测" | 400 | 阻止创建，提示管理员补录基准 |
| **EVAL-006** | 评测 | 模板配置无效 | "评测模板配置有误，请检查参数" | 400 | 阻止提交 |
| **EVAL-007** | 评测 | 芯片状态不允许 | "芯片当前状态不支持创建评测" | 400 | 提示芯片需处于 READY 状态 |
| **NODE-001** | 节点 | 节点离线（心跳 >2min） | "执行节点已离线" | 503 | 迁移任务到备用节点 |
| **NODE-002** | 节点 | GPU 温度 >85℃ | "GPU 温度过高" | 503 | 告警 + 暂停该节点上的任务 |
| **NODE-003** | 节点 | 磁盘使用率 >90% | "磁盘空间不足" | 503 | 告警，建议清理 |
| **NODE-004** | 节点 | Agent 版本过低 | "Agent 版本需要更新" | 400 | 提示更新 Agent |
| **NODE-005** | 节点 | 兼容性验证失败 | "节点兼容性验证未通过" | 400 | 显示具体不兼容项 |
| **AUTH-001** | 认证 | 密码错误 5 次 | "账号已锁定 1 小时，请稍后重试" | 423 | 锁定账号 1h |
| **AUTH-002** | 认证 | Token 过期 | "登录已过期，请重新登录" | 401 | 重定向到登录页 |
| **AUTH-003** | 认证 | 无权限 | "您没有权限执行此操作" | 403 | 返回 403 |
| **AUTH-004** | 认证 | 账号未激活 | "请先完成邮箱验证" | 403 | 提示重发验证邮件 |
| **AUTH-005** | 认证 | 租户已冻结 | "您的组织已被冻结，请联系管理员" | 403 | 只读模式 |
| **BILL-001** | 计费 | 余额不足 | "余额不足，请充值后重试" | 402 | 阻止创建任务 |
| **BILL-002** | 计费 | 结算异常 | "结算失败，请联系客服" | 500 | 告警 + 人工处理 |
| **BILL-003** | 计费 | 发票信息不完整 | "请完善发票信息" | 400 | 提示补全 |
| **SYS-001** | 系统 | 数据库连接失败 | "系统繁忙，请稍后重试" | 503 | 自动重连（指数退避） |
| **SYS-002** | 系统 | API 限流 | "请求过于频繁，请稍后重试" | 429 | 返回 Retry-After 头 |
| **SYS-003** | 系统 | 文件上传失败 | "文件上传失败，请重试" | 500 | 重试 |
| **SYS-004** | 系统 | 邮件发送失败 | "通知邮件发送失败" | 500 | 异步重试 |

### 错误响应格式

```json
{
  "error": {
    "code": "EVAL-001",
    "message": "评测任务超时",
    "detail": "任务 task-xxx 执行超时（限制: 3600s, 实际: 3601s）",
    "timestamp": "2026-04-01T12:00:00Z",
    "request_id": "req-uuid",
    "help_url": "https://ahvp.example.com/docs/errors/EVAL-001"
  }
}
```

---

## 附录F: API 版本管理策略 🆕

### 版本规范

| 项目 | 规则 |
|------|------|
| 当前版本 | `v1`，所有 API 路径前缀为 `/api/v1/...` |
| 版本共存 | 新版本发布后，旧版本保留 **6 个月** |
| 废弃通知 | 旧版本 API 响应头包含 `Deprecation: true` + `Sunset: YYYY-MM-DD` |
| 版本变更 | Breaking change → 升大版本（v1 → v2）；非 breaking → 小版本内兼容处理 |
| 文档 | 每个版本维护独立 API 文档（Swagger/OpenAPI 3.0） |

### Breaking Change 定义

以下变更视为 Breaking Change，需升大版本：

| 变更类型 | 示例 |
|----------|------|
| 删除 API 端点 | 移除 `GET /api/v1/chips` |
| 删除请求/响应字段 | 移除 `chips.architecture` |
| 修改字段类型 | `score` 从 `number` 改为 `string` |
| 修改枚举值 | `status` 移除已有选项 |
| 修改 URL 路径 | `/chips` → `/hardware` |
| 修改认证方式 | Bearer Token → API Key |

以下变更**不属于** Breaking Change：

| 变更类型 | 示例 |
|----------|------|
| 新增 API 端点 | 新增 `GET /api/v1/community/posts` |
| 新增可选字段 | 请求新增 `tags` 可选参数 |
| 新增响应字段 | 响应新增 `created_by` 字段 |
| 新增枚举值 | `status` 新增 `CONFIGURING` |

### 版本迁移指南

```
v1 → v2 迁移流程（未来适用）：

1. 发布 v2 API → v1 标记 Deprecation
2. 6 个月共存期:
   - v1: 正常服务，响应头含 Deprecation + Sunset
   - v2: 完整功能
3. 到期前 30 天: 邮件通知未迁移的开发者
4. 到期前 7 天: v1 返回 Warning 响应头
5. 到期: v1 返回 410 Gone
```

### API 限流策略

| 用户类型 | 限制 | 说明 |
|----------|------|------|
| 未认证 | 60 次/分钟 | IP 维度 |
| 基础认证 | 300 次/分钟 | 用户维度 |
| 高级认证 | 1000 次/分钟 | 用户维度 |
| 管理员 | 3000 次/分钟 | 用户维度 |

限流响应头：
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 150
X-RateLimit-Reset: 1680000000
Retry-After: 30  (仅 429 时返回)
```

---

## 附录G: DeepLink 数据导出格式映射 🆕

### AHVP 算子性能 → DeepLink gemm CSV

用于将平台评测的算子性能数据导出为 DeepLink 标准 gemm 数据收集表格式。

| # | AHVP 字段 | AHVP 路径 | DeepLink CSV 列 | 类型 | 说明 |
|---|-----------|-----------|-----------------|------|------|
| 1 | 算子名称 | `test_item` (MatMul) | `op_name` | string | 算子标识名 |
| 2 | 矩阵 M | `test_config.m` | `M` | int | GEMM 矩阵 M 维度 |
| 3 | 矩阵 K | `test_config.k` | `K` | int | GEMM 矩阵 K 维度 |
| 4 | 矩阵 N | `test_config.n` | `N` | int | GEMM 矩阵 N 维度 |
| 5 | 数据类型 | `test_config.dtype` | `dtype` | string | float16/float32/bfloat16 |
| 6 | 平均延迟 | `metrics.mean_latency_us` | `latency(us)` | float | 微秒 |
| 7 | 算力 | `metrics.tflops` | `TFLOPS` | float | 万亿次浮点运算/秒 |
| 8 | 设备名 | `chip.name` | `device` | string | 芯片型号名称 |

**导出 CSV 示例：**

```csv
op_name,M,K,N,dtype,latency(us),TFLOPS,device
MatMul,1024,1024,1024,float16,125.3,17.2,A100-80GB
MatMul,2048,2048,2048,float16,856.7,19.8,A100-80GB
MatMul,4096,4096,4096,float32,12560.2,10.5,A100-80GB
```

### AHVP 算子精度 → DeepLink accuracy CSV

用于将平台评测的算子精度数据导出为 DeepLink 标准精度数据收集表格式。

| # | AHVP 字段 | AHVP 路径 | DeepLink CSV 列 | 类型 | 说明 |
|---|-----------|-----------|-----------------|------|------|
| 1 | 算子名称 | `test_item` | `op_name` | string | 算子标识名 |
| 2 | 数据类型 | `test_config.dtype` | `dtype` | string | float16/float32/bfloat16 |
| 3 | 最大绝对误差 | `metrics.max_abs_error` | `max_abs_diff` | float | 绝对误差最大值 |
| 4 | 最大相对误差 | `metrics.max_rel_error` | `max_rel_diff` | float | 相对误差最大值 |
| 5 | 失败比例 | `metrics.fail_ratio` | `fail_ratio` | float | 元素级别不通过比例 |
| 6 | 测试结果 | `result_status` | `result` | string | PASS / FAIL |

**导出 CSV 示例：**

```csv
op_name,dtype,max_abs_diff,max_rel_diff,fail_ratio,result
Conv2d,float16,0.00012,0.0015,0.0,PASS
BatchNorm,float16,0.00025,0.0032,0.0001,PASS
LayerNorm,float32,0.0,0.0,0.0,PASS
Softmax,float16,0.00089,0.012,0.0023,FAIL
```

### 导出接口

```
POST /api/v1/exports/deeplink
Content-Type: application/json

{
  "chip_id": "uuid",
  "plan_id": "uuid（可选，不指定则导出所有评测数据）",
  "format": "gemm_csv | accuracy_csv | both",
  "dtype_filter": ["float16", "float32"]  // 可选，筛选数据类型
}

Response:
{
  "export_id": "uuid",
  "status": "processing",
  "download_urls": {
    "gemm_csv": "https://ahvp.example.com/exports/xxx/gemm.csv",
    "accuracy_csv": "https://ahvp.example.com/exports/xxx/accuracy.csv"
  },
  "expires_at": "2026-04-08T00:00:00Z"  // 下载链接 7 天有效
}
```

---

> **文档版本：** v3.0  
> **最后更新：** 2026-04-04  
> **作者：** AHVP 产品团队  
> **状态：** 评审中
