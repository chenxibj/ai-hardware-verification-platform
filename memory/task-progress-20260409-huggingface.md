# HuggingFace 模型支持 - 任务进度

## 状态: ✅ 已完成

## 完成时间: 2026-04-09 01:15 CST

## 修改内容

### 文件: `frontend/src/pages/TemplateList.js`

#### 1. 新增 SUGGESTED_HF_MODELS 常量
预置 6 个常用 HuggingFace 模型建议：
- bert-base-uncased
- gpt2
- meta-llama/Llama-2-7b-hf
- google/gemma-2b
- microsoft/phi-2
- mistralai/Mistral-7B-v0.1

#### 2. 编辑/创建表单 - 新增 HuggingFace 模型输入
- 使用 `Select mode="tags"` 组件，支持自由输入任意 HF 模型 ID
- 预置模型作为下拉建议选项
- `tokenSeparators={[","]}` 支持逗号分隔批量输入
- 自定义 `tagRender`：蓝色标签 + 🤗 图标，点击跳转 HuggingFace 页面
- 原"模型列表（多选）"标签改为"内置模型（多选）"以区分

#### 3. config_json 格式
使用独立字段 `huggingface_models`，完全向后兼容：
```json
{
  "models": ["MLP-Small"],
  "huggingface_models": ["bert-base-uncased", "meta-llama/Llama-2-7b-hf"],
  "operators": [...],
  ...
}
```

#### 4. 详情弹窗展示
- 新增 "HuggingFace 模型" 区块（仅当有 HF 模型时显示）
- 蓝色 Tag 显示，带 🤗 图标
- 点击 Tag 跳转到 `https://huggingface.co/{modelId}`

#### 5. 卡片视图
- 评测项计数现在包含 HF 模型数量
- 新增蓝色 "🤗 N HF模型" 徽章

#### 6. 表单验证
- MODEL/CHIP 层级验证：内置模型或 HF 模型至少选一个即可
- 不再强制要求选择内置模型

### 后端
无需改动。`config_json` 是 JSONB 自由字段，后端只验证 JSON 格式和 batchSizes。

## Git
- Commit: `cca93b0d` - `feat: 模板支持 HuggingFace 模型链接/ID`
- Branch: main
- Pushed: ✅

## 部署
- 前端 build 成功
- docker cp 到 ahvp-frontend 容器 ✅
- 线上可访问: http://39.97.251.94/
