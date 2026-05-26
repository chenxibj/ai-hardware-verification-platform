# 评测结果及资产管理模块设计文档

> **模块定位：** PRD 模块 2 — 核心支撑模块  
> **文档版本：** v1.0  
> **创建日期：** 2026-05-26  
> **作者：** 菜菜子 (AI PM)  
> **状态：** Draft — 待 Review

---

## 1. 模块概述

### 1.1 核心定位

负责评测产出（报告、日志、数据）及数字资产（模型、数据集、算子、脚本、流程模板）的全生命周期管理。本模块是评测系统（模块 1）的下游消费者，为社区模块（模块 3）提供可分享内容源。

### 1.2 功能子模块

| 子模块 | PRD 章节 | 核心职责 |
|--------|----------|----------|
| 评测报告管理 | 2.1 | 报告生成、存储、版本控制、分享 |
| 评测报告分析 | 2.2 | 多维可视化、趋势分析、异常检测、自定义报表 |
| 报告对比工具 | 2.3 | 多报告横向/纵向对比、对比报告自动生成 |
| 数字资产管理 | 2.4 | 资产 CRUD、版本管理、检索复用、权限分享、回收清理 |
| 日志与数据管理 | 2.5 | 日志采集存储、检索查看、数据关联、安全合规 |

### 1.3 当前实现状态

| 功能 | 完成度 | 说明 |
|------|--------|------|
| 报告基础 CRUD | ~70% | ReportController + ChipReportRepository，支持分页/筛选/详情 |
| 报告自动生成 | ~60% | ReportGeneratorService + ReportDataAssembler + ReportInsightBuilder |
| 报告对比 | ~50% | /reports/compare 接口已有，支持多报告横向对比 |
| 报告分析 | ~40% | ReportAnalysisController 存在，前端 ReportAnalysis.js |
| 数字资产管理 | ~65% | 完整 Entity/Controller/Service，前端已有 13+ 组件（分类、搜索、预览、复用、版本、回收站等） |
| 评测日志 | ~50% | EvalLogController + WebSocket 实时推送 + 前端 LogEnhanced |
| 评测结果 | ~55% | EvaluationResult Entity + Controller + MetricsNormalizer |

---

## 2. 数据模型设计

### 2.1 核心实体关系

```
EvaluationTask (1) ──→ (N) EvaluationResult
EvaluationTask (1) ──→ (1) ChipReport (自动生成)
EvaluationTask (1) ──→ (N) EvalLog
ChipReport    (N) ──→ (N) ComparisonResult (对比)
DigitalAsset  (独立实体，通过 tags/metadata 关联评测)
```

### 2.2 ChipReport（评测报告）

已实现字段（基于 ChipReport.java）：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Long | 主键 |
| reportNo | String | 报告编号（租户ID-任务ID-时间戳） |
| title | String | 报告标题 |
| chipId | Long | 关联芯片 |
| planId | Long | 关联评测方案 |
| taskId | Long | 关联评测任务 |
| status | Enum | DRAFT/GENERATING/COMPLETED/FAILED |
| reportType | String | BASIC(免费)/ADVANCED(收费)/CUSTOM(定制) |
| content | JSONB | 报告内容（结构化 JSON） |
| summary | Text | 摘要 |
| version | Integer | 版本号 |
| createdBy | Long | 创建者 |
| createdAt | Instant | 创建时间 |

**待补充字段（PRD 要求）：**
- `shareToken` — 分享链接 token
- `shareExpiry` — 分享有效期
- `sharePassword` — 访问密码
- `exportFormat` — 最后导出格式
- `parentReportId` — 版本溯源（父版本 ID）

### 2.3 DigitalAsset（数字资产）

已实现字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Long | 主键 |
| assetNo | String | 资产编号（唯一） |
| name | String | 资产名称 |
| assetType | String | MODEL/DATASET/OPERATOR/SCRIPT/TEMPLATE |
| description | String | 描述 |
| version | String | 版本号 |
| filePath | String | MinIO 存储路径 |
| fileSize | Long | 文件大小 |
| mimeType | String | MIME 类型 |
| fileFormat | String | 文件格式 |
| sourceUrl | String | 来源 URL |
| status | Enum | ACTIVE/ARCHIVED/DELETED |
| tags | JSONB | 标签（支持自定义） |
| metadata | JSONB | 元数据（格式/框架/版本等） |
| downloadCount | Integer | 下载次数 |
| createdBy | Long | 创建者 |

**待补充字段（PRD 要求）：**
- `shareScope` — 分享范围（PERSONAL/TEAM/PLATFORM）
- `lockedVersion` — 是否锁定当前版本
- `compatibilityInfo` — 兼容性校验结果
- `reuseCount` — 复用次数统计
- `deletedAt` — 软删除时间（回收站，30 天）

### 2.4 EvalLog（评测日志）

已实现，支持实时 WebSocket 推送 + REST 查询。

### 2.5 EvaluationResult（评测结果）

已实现，MetricsNormalizer 负责指标归一化处理。

---

## 3. API 设计

### 3.1 报告管理 API

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| GET | /reports | 报告列表（分页/筛选） | ✅ 已实现 |
| GET | /reports/{id} | 报告详情 | ✅ 已实现 |
| POST | /reports/generate | 触发报告生成 | ✅ 已实现 |
| GET | /reports/compare?ids=1,2,3 | 报告对比 | ✅ 已实现 |
| POST | /reports/compare | 报告对比（POST） | ✅ 已实现 |
| **POST** | **/reports/{id}/share** | **生成分享链接** | 🔲 待实现 |
| **GET** | **/reports/shared/{token}** | **通过分享链接访问** | 🔲 待实现 |
| **POST** | **/reports/{id}/export** | **导出报告(PDF/Excel/JSON)** | 🔲 待实现 |
| **GET** | **/reports/{id}/versions** | **报告版本历史** | 🔲 待实现 |
| **POST** | **/reports/{id}/rollback/{version}** | **版本回滚** | 🔲 待实现 |

### 3.2 报告分析 API

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| GET | /reports/{id}/analysis | 报告分析数据 | ✅ 已实现 |
| **GET** | **/reports/{id}/trends** | **趋势分析** | 🔲 待实现 |
| **GET** | **/reports/{id}/anomalies** | **异常检测** | 🔲 待实现 |
| **POST** | **/reports/custom-export** | **自定义报表导出** | 🔲 待实现 |

### 3.3 数字资产 API

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| GET | /assets | 资产列表 | ✅ 已实现 |
| GET | /assets/{id} | 资产详情 | ✅ 已实现 |
| POST | /assets | 创建资产 | ✅ 已实现 |
| PUT | /assets/{id} | 更新资产 | ✅ 已实现 |
| DELETE | /assets/{id} | 删除(移入回收站) | ✅ 已实现 |
| POST | /assets/{id}/upload | 文件上传 | ✅ 已实现 |
| GET | /assets/search | 多条件检索 | ✅ 已实现 |
| **GET** | **/assets/{id}/versions** | **版本历史** | 🔲 待实现 |
| **POST** | **/assets/{id}/rollback/{version}** | **版本回滚** | 🔲 待实现 |
| **POST** | **/assets/{id}/validate** | **兼容性校验** | 🔲 待实现 |
| **POST** | **/assets/{id}/share** | **资产分享** | 🔲 待实现 |
| **GET** | **/assets/recycle-bin** | **回收站列表** | ✅ 已实现 |
| **POST** | **/assets/recycle-bin/{id}/restore** | **恢复资产** | 🔲 待实现 |
| **GET** | **/assets/stats** | **资产统计** | 🔲 待实现 |

### 3.4 日志 API

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| GET | /eval-logs | 日志查询 | ✅ 已实现 |
| WS | /ws/tasks | 实时日志推送 | ✅ 已实现 |
| **GET** | **/eval-logs/export** | **日志导出** | 🔲 待实现 |
| **GET** | **/eval-logs/search** | **高级检索(关键词/时间/级别)** | 🔲 待实现 |

---

## 4. 前端页面设计

### 4.1 已实现页面

| 页面 | 文件 | 功能 |
|------|------|------|
| 报告列表 | ReportList.js | 分页展示、状态筛选 |
| 报告详情 | ChipReport.js | 报告内容展示 |
| 报告分析 | ReportAnalysis.js | 数据可视化分析 |
| 报告对比 | ReportCompare.js / Comparisons.js | 横向对比 |
| 资产列表 | Assets.js + 13 子组件 | 分类导航、搜索、表格、预览、复用、标签、版本 |
| 资产详情 | AssetDetail.js | 详情+预览 |
| 资产上传 | AssetUpload.js | 文件上传+校验 |
| 资产备份 | AssetBackup.js | 备份管理 |
| 资产回收站 | AssetRecycleBin.js | 软删除恢复 |
| 日志查看 | Logs.js + LogEnhanced.js | 实时日志流+筛选 |
| 评测结果 | TaskResult.js | 单任务结果详情 |

### 4.2 待实现/增强页面

| 页面 | 优先级 | PRD 要求 |
|------|--------|----------|
| 报告分享页（公开链接） | P1 | 有效期+密码访问 |
| 报告导出预览 | P1 | PDF/Excel/JSON 格式选择+字段自定义 |
| 趋势分析仪表板 | P2 | 折线图趋势+异常标注 |
| 资产兼容性验证结果页 | P2 | 校验结果展示 |
| 定时导出配置 | P3 | 报表定时生成调度 |
| 数据安全审计日志 | P2 | 访问记录+合规审计 |

---

## 5. 技术方案

### 5.1 报告生成流水线

```
任务完成 → TaskCompletionHandler
  → ReportGeneratorService.generate(taskId)
    → ReportDataAssembler（数据组装：指标、配置、环境）
    → ReportInsightBuilder（智能分析：结论、建议、异常标注）
    → ChipReport 持久化
    → 状态: GENERATING → COMPLETED/FAILED
```

**现有实现优势：**
- 已有 DataAssembler + InsightBuilder 分层设计
- 已支持自动生成（任务完成触发）
- 已有 MetricsNormalizer 指标归一化

**待增强：**
- 高级版报告生成（增加深度分析、优化建议、可视化图表嵌入）
- 报告模板引擎（支持 Freemarker/Thymeleaf 渲染 PDF）
- 异步生成 + 进度回调

### 5.2 报告导出方案

| 格式 | 技术方案 | 优先级 |
|------|----------|--------|
| PDF | OpenPDF / iText + HTML 模板渲染 | P1 |
| Excel | Apache POI / EasyExcel | P1 |
| JSON | 直接序列化 report.content | P0（已有） |
| CSV | 指标数据扁平化导出 | P2 |

### 5.3 报告分享方案

```java
// 分享链接生成
POST /reports/{id}/share
{
  "expiryDays": 7,      // 1-30 天
  "password": "可选",
  "permissions": ["VIEW", "DOWNLOAD"]
}

// 返回
{
  "shareUrl": "https://platform.com/shared/reports/{token}",
  "token": "uuid-v4",
  "expiresAt": "2026-06-02T00:00:00Z"
}
```

**实现要点：**
- Token 使用 UUID v4，存储在 report_shares 表
- 访问时校验：token 有效性 + 过期时间 + 密码（如设置）
- 权限粒度：查看 / 下载 / 编辑
- 分享撤销：DELETE /reports/{id}/share/{token}

### 5.4 数字资产版本管理

```
digital_asset_versions 表:
  id, asset_id, version, file_path, file_size, changelog, created_by, created_at

规则:
- 每次上传新文件 → 自动创建新 version
- 旧版本文件保留在 MinIO (路径: /assets/{assetNo}/v{version}/...)
- 版本锁定: locked=true 时禁止覆盖
- 回滚: 复制历史版本文件路径到当前 asset 记录
```

### 5.5 日志存储策略

| 数据类型 | 保留策略 | 存储 |
|----------|----------|------|
| 实时日志 | 7 天热数据 | PostgreSQL + TimescaleDB |
| 归档日志 | 90 天温数据 | MinIO (压缩) |
| 审计日志 | 3 年冷数据 | MinIO (加密) |

---

## 6. 第一期实现优先级（2026.09 目标）

### P0 — 必须完成（当前已基本具备）

- [x] 报告自动生成（任务完成触发）
- [x] 报告列表/详情/筛选
- [x] 报告对比（多报告横向）
- [x] 资产 CRUD + 文件上传
- [x] 资产搜索 + 分类 + 标签
- [x] 评测日志实时推送 + 查询
- [x] 评测结果展示 + 指标归一化

### P1 — 需在第一期补充

- [ ] 报告 PDF 导出（基础版，免费）
- [ ] 报告分享链接（含有效期）
- [ ] 资产版本管理（基础：上传新版本 + 版本列表）
- [ ] 日志高级检索（关键词 + 时间范围 + 级别筛选）
- [ ] 报告版本控制（基础：版本号 + 历史列表）

### P2 — 第一期可选/第二期

- [ ] 高级版报告（收费，深度分析+优化建议）
- [ ] 趋势分析 + 异常检测
- [ ] 自定义报表导出（字段选择 + 定时）
- [ ] 资产兼容性自动校验
- [ ] 资产分享（团队/平台级）
- [ ] 数据安全审计（合规日志 3 年）

### P3 — 后续迭代

- [ ] 报告预测分析（AI 驱动）
- [ ] 资产复用推荐（基于相似度）
- [ ] 定时报表推送（邮件/站内信）
- [ ] 批量资产导入/导出

---

## 7. 与其他模块的接口

### 7.1 上游依赖（模块 1 → 模块 2）

- `TaskCompletionEvent` → 触发报告自动生成
- `EvaluationResult` → 报告数据源
- `EvalLog` → 日志采集源

### 7.2 下游消费（模块 2 → 模块 3）

- 免费基础版报告 → 社区可下载内容
- 数字资产（模型/数据集） → 社区资源分享

### 7.3 依赖模块（模块 4 + 模块 5）

- 用户体系 → 权限控制（报告/资产的 RBAC）
- 资源纳管 → 存储配额管理（MinIO 空间）

---

## 8. 非功能要求

| 指标 | 目标 | 方案 |
|------|------|------|
| 报告生成时间 | 基础版 ≤10min | 异步生成 + 数据预聚合 |
| 日志查询延迟 | P95 ≤2s | TimescaleDB 时间分区 + 索引 |
| 资产上传大小 | 单文件 ≤5GB | MinIO 分片上传 |
| 数据加密 | 传输 HTTPS + 存储 AES-256 | Spring Security + MinIO 加密 |
| 并发报告生成 | ≥50 并发任务 | 线程池 + 队列限流 |

---

## 9. 风险与技术债

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| PDF 生成性能 | 复杂报告渲染慢 | 异步 + 缓存 + 分页渲染 |
| MinIO 存储膨胀 | 版本文件累积 | 自动清理策略 + 存储监控 |
| 报告内容 JSONB 查询性能 | 大报告检索慢 | GIN 索引 + 摘要字段冗余 |
| 分享链接安全 | Token 泄露风险 | 短有效期 + 密码保护 + 访问日志 |

---

## 10. 开发工作量估算

| 功能 | 预估工时 | 依赖 |
|------|----------|------|
| 报告 PDF 导出 | 3 天 | OpenPDF 集成 |
| 报告分享机制 | 2 天 | 新表 + Controller |
| 报告版本控制 | 2 天 | 字段扩展 |
| 资产版本管理 | 3 天 | 新表 + MinIO 路径策略 |
| 日志高级检索 | 2 天 | 查询优化 |
| 趋势分析后端 | 3 天 | 时序数据聚合 |
| 前端趋势仪表板 | 3 天 | ECharts 集成 |
| **P1 合计** | **~12 工作日** | — |

---

## 附录 A: 现有代码结构

```
backend/
  com.lab.chipreport/
    ChipReport.java              — 报告实体
    ChipReportController.java    — 芯片维度报告 API
    ReportController.java        — 顶层 /reports API
    ReportAnalysisController.java — 报告分析
    ReportGeneratorService.java  — 报告生成引擎
    ReportDataAssembler.java     — 数据组装
    ReportInsightBuilder.java    — 智能分析
    ChipReportSpec.java          — JPA Specification 动态查询
  com.lab.asset/
    DigitalAsset.java            — 资产实体
    DigitalAssetController.java  — 资产 CRUD API
    DigitalAssetService.java     — 资产业务逻辑
    AssetService.java            — 资产存储服务
  com.lab.result/
    EvaluationResult.java        — 评测结果实体
    EvaluationResultController.java
    MetricsNormalizer.java       — 指标归一化
  com.lab.evallog/
    EvalLog.java                 — 日志实体
    EvalLogController.java       — 日志查询
  com.lab.comparison/
    ComparisonResult.java        — 对比结果

frontend/
  pages/
    ReportList.js, ChipReport.js, ReportCompare.js
    Assets.js (+ 13 子组件), AssetDetail.js, AssetUpload.js
    AssetBackup.js, AssetRecycleBin.js
    Logs.js, TaskResult.js
  components/
    reports/ReportAnalysis.js
    logs/LogEnhanced.js
```
