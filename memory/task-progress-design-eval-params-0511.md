# 任务进展：评测参数配置设计文档（US-1.4）

> 日期: 2026-05-11
> 状态: ✅ 完成

## 完成内容

设计文档已提交: `docs/design-eval-params.md` (commit d63a9b2e, pushed to main)

## 设计文档摘要

### 核心方案
- **六层参数模型**: 芯片/算子/中间层/框架/模型/场景，每层独立配置面板
- **JSON 结构**: `evalConfig = { dimension, common: {...}, chip: {...}, ... }` — 通用参数 + 维度专属参数
- **向后兼容**: 旧数据无 `dimension` 字段时整体视为 common，零迁移风险
- **数据库**: 无需新增表或字段（复用现有 `dimension` varchar(32) 和 `eval_config` jsonb）

### 前端改造
- EvalConfigStep 拆分为 CommonConfigPanel + 6 个维度面板
- 新增 `frontend/src/components/tasks/evalConfig/` 目录
- BasicInfoStep 新增"评测维度"下拉框
- PrecisionConfigTab 内容合并到 ChipConfigPanel

### 后端改造
- 极小改动：`dimension` 非空校验 + EvalConfigValidator
- V1 阶段 schema 前端硬编码，V2 迁移后端 API

### 实现计划（5 个 Issue, ~13 工作日）
1. Issue 1: 前端重构 — 抽取通用面板 + 路由框架 (3d)
2. Issue 2: 芯片 + 算子配置面板 (3d)
3. Issue 3: 框架 + 模型配置面板 (3d)
4. Issue 4: 中间层 + 场景配置面板 (2d)
5. Issue 5: 后端校验 + 模板联动 (2d)

### 待讨论决策点
1. Schema API 是否 V1 就需后端实现？（建议 V1 前端硬编码）
2. 旧数据是否需要跑 dimension 回填脚本？（建议不跑，读取兼容）
3. 场景评测的业务指标定义是否过早？（建议先实现框架）
