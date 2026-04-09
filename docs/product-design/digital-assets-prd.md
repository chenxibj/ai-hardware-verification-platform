# 数字资产管理模块 PRD v1.0

> **文档版本:** v1.0  
> **创建日期:** 2026-04-09  
> **更新日期:** 2026-04-09  
> **作者:** 菜菜子（产品经理）  
> **状态:** 初版，待评审  
> **目标读者:** 前后端开发、架构师、测试团队、产品  
> **关联文档:** product-design-v3.2.md 第 2.4 节（数字资产管理）  
> **关联模块:** 评测任务管理（资产引用）、社区模块（资产展示）、资源管理（存储后端）

---

## 变更记录

| 版本 | 日期 | 变更内容 | 决策来源 |
|------|------|---------|---------|
| v1.0 | 2026-04-09 | 初版：数字资产独立菜单设计，三阶段 MVP 路线图 | chenxi 需求 + 菜菜子设计 |

---

## 1. 概述

### 1.1 背景

AHVP 平台的核心业务围绕 AI 硬件验证评测展开，而评测任务的执行依赖大量数字资产——模型文件、数据集、算子、脚本和流程模板。当前这些资产分散在各模块中，缺乏统一管理入口，导致以下问题：

1. **资产查找困难** — 用户无法快速检索到已有资产，重复上传浪费存储
2. **版本混乱** — 同一模型的不同版本无法追溯，评测结果难以复现
3. **复用率低** — 团队间缺乏资产分享机制，优质资产无法沉淀和传播
4. **管理碎片化** — 资产分散在评测任务、流程编排等模块中，没有统一视图

chenxi 明确要求将数字资产提升为**一级菜单**，作为独立模块进行设计和实现，而不是评测系统的附属功能。

### 1.2 目标

1. **统一资产管理** — 提供一站式数字资产管理平台，涵盖五大类资产的全生命周期管理
2. **版本可追溯** — 每个资产的每次变更可追溯、可回滚、可锁定
3. **高效检索复用** — 多维度检索 + 在线预览 + 一键复用到评测任务
4. **安全分享** — 支持个人/团队/全平台三种分享范围，精细化权限控制
5. **存储可控** — 回收站机制 + 自动备份 + 存储监控告警

### 1.3 范围（MVP 裁剪后）

| 在 MVP 范围内 | 推迟到 Future |
|--------------|--------------|
| 五大类资产 CRUD + 分类管理 | 资产智能推荐（基于使用记录） |
| 自定义标签系统（key:value） | AI 自动标签（基于内容分析） |
| 版本管理（创建/回滚/锁定） | 版本 diff 可视化对比 |
| 基础文件上传（单个 + 批量） | 自动校验（模型可加载/数据集完整性） |
| 多条件组合检索 | 语义搜索（向量检索） |
| 在线预览（数据集/脚本/模板） | 模型在线推理预览 |
| 三种分享范围 + 权限控制 | 资产定价与计费 |
| 回收站 + 手动备份 | 自动定时备份 + 增量备份 |
| 存储用量统计 | 存储配额管理 + 超限告警 |

### 1.4 设计原则

| 原则 | 说明 |
|------|------|
| **独立一级菜单** | 数字资产不是评测结果的子页面，而是与"评测管理""资源管理"平级的一级模块 |
| **与评测联动** | 创建评测任务时可直接从资产库选择模型/数据集/算子，减少重复上传 |
| **与社区联动** | 全平台共享的资产可在社区模块中展示和发现 |
| **存储分离** | 文件存 MinIO（已部署），元数据存 PostgreSQL |
| **渐进增强** | Phase 1 先跑通基础 CRUD，再逐步叠加检索/分享/校验等高级能力 |

---

## 2. 术语定义

| 术语 | 英文 | 定义 |
|------|------|------|
| 数字资产 | Digital Asset | 平台内可复用的数字化内容，包括模型、数据集、算子、脚本、流程模板 |
| 资产分类 | Asset Category | 资产的层级分类体系，包含大类和细分类型 |
| 资产标签 | Asset Tag | 以 key:value 形式附加在资产上的自定义元数据，用于筛选和检索 |
| 资产版本 | Asset Version | 资产的特定快照，包含文件内容、元数据和版本说明 |
| 版本锁定 | Version Lock | 将某个版本标记为不可修改/删除，仅可查看和复用 |
| 分享范围 | Sharing Scope | 资产的可见性范围：PRIVATE（个人）、TEAM（团队）、PUBLIC（全平台） |
| 资产复用 | Asset Reuse | 在评测任务或流程编排中引用已有资产，而非重新上传 |
| 回收站 | Recycle Bin | 已删除资产的临时存放区，30天内可恢复 |
| MinIO Bucket | MinIO Bucket | MinIO 对象存储中的逻辑容器，按资产类型分桶存储 |

---

## 3. 系统架构

### 3.1 数字资产管理整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AHVP 前端 (React + Ant Design)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │资产总览   │ │资产列表   │ │资产详情   │ │资产上传   │ │ 回收站   │ │
│  │Dashboard │ │+分类导航  │ │+版本历史  │ │+批量上传  │ │          │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
└───────┼────────────┼────────────┼────────────┼────────────┼────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API Gateway (REST)                           │
└───────┬────────────┬────────────┬────────────┬────────────┬────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Asset Svc   │ │Version   │ │Search    │ │Share     │ │Cleanup   │
│             │ │  Svc     │ │  Svc     │ │  Svc     │ │  Svc     │
│ - CRUD      │ │- 版本创建│ │- 组合检索│ │- 分享管理│ │- 回收站  │
│ - 分类管理  │ │- 版本回滚│ │- 排序    │ │- 权限控制│ │- 备份    │
│ - 标签管理  │ │- 版本锁定│ │- 预览    │ │- 审计日志│ │- 存储监控│
│ - 上传校验  │ │          │ │- 复用记录│ │          │ │          │
└──────┬──────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
       │             │            │            │            │
       ▼             ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           数据层                                     │
│  ┌───────────────────────────┐  ┌───────────────────────────────┐   │
│  │  PostgreSQL（元数据）       │  │  MinIO（文件存储）              │   │
│  │  - assets 表              │  │  - ahvp-models bucket         │   │
│  │  - asset_versions 表      │  │  - ahvp-datasets bucket       │   │
│  │  - asset_tags 表          │  │  - ahvp-operators bucket      │   │
│  │  - asset_categories 表    │  │  - ahvp-scripts bucket        │   │
│  │  - asset_shares 表        │  │  - ahvp-templates bucket      │   │
│  │  - asset_reuse_records 表 │  │  - ahvp-trash bucket          │   │
│  └───────────────────────────┘  └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 资产存储策略

```
上传请求 ──▶ API Gateway ──▶ Asset Service
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              元数据写入 PG    文件写入 MinIO    版本记录创建
                    │               │               │
                    ▼               ▼               ▼
              assets 表       bucket/asset_id/   asset_versions 表
              asset_tags 表    v{version}/file    
```

**MinIO Bucket 规划:**

| Bucket | 存储内容 | 说明 |
|--------|---------|------|
| ahvp-models | 模型文件 | ONNX, PyTorch (.pt/.pth), TensorFlow (.pb/.h5) |
| ahvp-datasets | 数据集文件 | CSV, 图片集(zip), 文本集, JSON |
| ahvp-operators | 算子文件 | Python (.py), C++ (.cpp/.h), 编译产物 |
| ahvp-scripts | 脚本文件 | Python 脚本, Shell 脚本 |
| ahvp-templates | 流程模板 | JSON 格式的流程定义文件 |
| ahvp-trash | 回收站文件 | 已删除文件暂存，30天后自动清理 |

**文件路径规则:** `{bucket}/{asset_id}/v{version}/{filename}`

---

## 4. 数据库设计

### 4.1 核心表结构

**asset_categories（资产分类表）**

```sql
CREATE TABLE asset_categories (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,          -- 分类名称
    parent_id   BIGINT REFERENCES asset_categories(id),  -- 父分类（NULL 为顶级分类）
    asset_type  VARCHAR(20) NOT NULL,           -- MODEL/DATASET/OPERATOR/SCRIPT/TEMPLATE
    sort_order  INT DEFAULT 0,                  -- 排序序号
    icon        VARCHAR(50),                    -- 分类图标标识
    description TEXT,                           -- 分类说明
    created_by  BIGINT,                         -- 创建人
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(name, parent_id)
);

-- 默认顶级分类（系统预置）
INSERT INTO asset_categories (name, asset_type, sort_order) VALUES
('模型资产', 'MODEL', 1),
('数据集资产', 'DATASET', 2),
('算子资产', 'OPERATOR', 3),
('脚本资产', 'SCRIPT', 4),
('流程模板资产', 'TEMPLATE', 5);
```

**assets（资产主表）**

```sql
CREATE TABLE assets (
    id              BIGSERIAL PRIMARY KEY,
    asset_uid       VARCHAR(32) NOT NULL UNIQUE,     -- 资产唯一标识（如 AST-20260409-00001）
    name            VARCHAR(200) NOT NULL,           -- 资产名称
    asset_type      VARCHAR(20) NOT NULL,            -- MODEL/DATASET/OPERATOR/SCRIPT/TEMPLATE
    category_id     BIGINT REFERENCES asset_categories(id),  -- 所属分类
    description     TEXT,                            -- 资产描述
    current_version VARCHAR(20) DEFAULT 'v1.0',      -- 当前版本号
    file_size       BIGINT DEFAULT 0,                -- 当前版本文件大小（bytes）
    file_format     VARCHAR(50),                     -- 文件格式（onnx/pt/csv/py/json 等）
    minio_bucket    VARCHAR(100),                    -- MinIO bucket 名
    minio_path      VARCHAR(500),                    -- MinIO 对象路径
    applicable_scene TEXT,                           -- 适用场景描述
    dependency_env  TEXT,                            -- 依赖环境说明
    share_scope     VARCHAR(20) DEFAULT 'PRIVATE',   -- PRIVATE/TEAM/PUBLIC
    status          VARCHAR(20) DEFAULT 'ACTIVE',    -- ACTIVE/DELETED/ARCHIVED
    download_count  INT DEFAULT 0,                   -- 下载次数
    reuse_count     INT DEFAULT 0,                   -- 复用次数
    owner_id        BIGINT NOT NULL,                 -- 资产所有者（创建人）
    team_id         BIGINT,                          -- 所属团队（用于 TEAM 分享范围）
    deleted_at      TIMESTAMP,                       -- 软删除时间（进入回收站）
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_category ON assets(category_id);
CREATE INDEX idx_assets_owner ON assets(owner_id);
CREATE INDEX idx_assets_share ON assets(share_scope, status);
CREATE INDEX idx_assets_name ON assets USING gin(to_tsvector('simple', name));  -- 全文检索索引
CREATE INDEX idx_assets_status ON assets(status);
```

**asset_versions（资产版本表）**

```sql
CREATE TABLE asset_versions (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        BIGINT NOT NULL REFERENCES assets(id),
    version         VARCHAR(20) NOT NULL,            -- 版本号（v1.0, v1.1, v2.0...）
    version_note    TEXT,                            -- 版本说明
    file_size       BIGINT DEFAULT 0,                -- 该版本文件大小
    file_hash       VARCHAR(128),                    -- 文件 SHA-256 哈希
    minio_path      VARCHAR(500) NOT NULL,           -- 该版本文件在 MinIO 中的路径
    is_locked       BOOLEAN DEFAULT FALSE,           -- 是否版本锁定
    locked_by       BIGINT,                          -- 锁定操作人
    locked_at       TIMESTAMP,                       -- 锁定时间
    lock_reason     TEXT,                            -- 锁定原因
    validation_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING/PASSED/FAILED（校验状态）
    validation_detail JSONB,                         -- 校验详情
    created_by      BIGINT NOT NULL,                 -- 上传人
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_id, version)
);

CREATE INDEX idx_versions_asset ON asset_versions(asset_id);
```

**asset_tags（资产标签表）**

```sql
CREATE TABLE asset_tags (
    id          BIGSERIAL PRIMARY KEY,
    asset_id    BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    tag_key     VARCHAR(64) NOT NULL,               -- 标签 key
    tag_value   VARCHAR(128) NOT NULL,              -- 标签 value
    created_by  BIGINT,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_id, tag_key)
);

CREATE INDEX idx_tags_asset ON asset_tags(asset_id);
CREATE INDEX idx_tags_key_value ON asset_tags(tag_key, tag_value);
```

**asset_shares（资产分享记录表）**

```sql
CREATE TABLE asset_shares (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        BIGINT NOT NULL REFERENCES assets(id),
    shared_by       BIGINT NOT NULL,                 -- 分享人
    shared_to_type  VARCHAR(20) NOT NULL,            -- USER/TEAM/PUBLIC
    shared_to_id    BIGINT,                          -- 目标用户或团队 ID（PUBLIC 时为 NULL）
    permission      VARCHAR(20) NOT NULL,            -- VIEW/REUSE/EDIT/DOWNLOAD
    is_revoked      BOOLEAN DEFAULT FALSE,           -- 是否已撤销
    revoked_at      TIMESTAMP,                       -- 撤销时间
    revoked_by      BIGINT,                          -- 撤销人
    expires_at      TIMESTAMP,                       -- 分享过期时间（NULL=永不过期）
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shares_asset ON asset_shares(asset_id);
CREATE INDEX idx_shares_target ON asset_shares(shared_to_type, shared_to_id);
```

**asset_reuse_records（资产复用记录表）**

```sql
CREATE TABLE asset_reuse_records (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        BIGINT NOT NULL REFERENCES assets(id),
    asset_version   VARCHAR(20),                     -- 被复用的版本
    reuse_type      VARCHAR(50) NOT NULL,            -- EVALUATION_TASK/WORKFLOW/DOWNLOAD
    reuse_target_id BIGINT,                          -- 评测任务ID或流程ID
    reuse_target_name VARCHAR(200),                  -- 目标名称（冗余方便展示）
    user_id         BIGINT NOT NULL,                 -- 操作人
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reuse_asset ON asset_reuse_records(asset_id);
CREATE INDEX idx_reuse_user ON asset_reuse_records(user_id);
```

**asset_share_audit_logs（分享审计日志表）**

```sql
CREATE TABLE asset_share_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        BIGINT NOT NULL,
    action          VARCHAR(50) NOT NULL,            -- SHARE/REVOKE/PERMISSION_CHANGE/ACCESS
    actor_id        BIGINT NOT NULL,                 -- 操作人
    detail          JSONB,                           -- 操作详情
    ip_address      VARCHAR(45),                     -- 操作者IP
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_asset ON asset_share_audit_logs(asset_id);
CREATE INDEX idx_audit_time ON asset_share_audit_logs(created_at);
```

**asset_backups（资产备份记录表）**

```sql
CREATE TABLE asset_backups (
    id              BIGSERIAL PRIMARY KEY,
    backup_name     VARCHAR(200) NOT NULL,
    backup_type     VARCHAR(20) NOT NULL,            -- MANUAL/AUTO
    scope           VARCHAR(20) NOT NULL,            -- FULL/CATEGORY/SELECTIVE
    scope_detail    JSONB,                           -- 备份范围详情（分类ID列表、资产ID列表等）
    minio_path      VARCHAR(500) NOT NULL,           -- 备份文件在 MinIO 中的路径
    file_size       BIGINT DEFAULT 0,                -- 备份文件大小
    asset_count     INT DEFAULT 0,                   -- 包含资产数
    status          VARCHAR(20) DEFAULT 'IN_PROGRESS', -- IN_PROGRESS/COMPLETED/FAILED
    created_by      BIGINT,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 4.2 ER 关系图

```
asset_categories (1) ──────< (N) assets
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              (1:N) ▼        (1:N) ▼        (1:N) ▼
         asset_versions    asset_tags     asset_shares
                                               │
                                         (1:N) ▼
                                   asset_share_audit_logs

assets (1) ──────< (N) asset_reuse_records
```

---

## 5. 核心功能设计

### 5.1 资产分类管理

#### 5.1.1 分类体系

**预置五大类及默认细分:**

| 大类 | asset_type | 默认细分类型 |
|------|-----------|------------|
| 模型资产 | MODEL | 图像分类、目标检测、语义分割、自然语言处理、语音识别、推荐系统、其他 |
| 数据集资产 | DATASET | 图像数据集、文本数据集、语音数据集、表格数据集、多模态数据集、其他 |
| 算子资产 | OPERATOR | 前处理算子、后处理算子、推理算子、数据转换算子、自定义算子、其他 |
| 脚本资产 | SCRIPT | 评测脚本、数据处理脚本、性能测试脚本、部署脚本、工具脚本、其他 |
| 流程模板资产 | TEMPLATE | 标准评测流程、性能基准流程、回归测试流程、自定义流程、其他 |

#### 5.1.2 分类配置（管理员功能）

**User Story:** 作为平台管理员，我需要自定义资产分类维度和名称，以适应不同客户的业务场景。

**操作:**
- 系统设置 → 资产分类配置
- 支持添加/编辑/删除细分类型（顶级五大类不可删除）
- 拖拽调整分类排序
- 删除分类前检查：该分类下是否有资产？有则提示先迁移

**验收标准:**
- AC-1: 管理员可增删改细分分类
- AC-2: 顶级五大类不可删除
- AC-3: 删除有资产的分类时阻止并提示
- AC-4: 分类变更即时生效，已有资产不受影响

#### 5.1.3 标签系统

**User Story:** 作为用户，我需要为资产打自定义标签（如 `hardware:ascend910`, `task:classification`），方便检索和分组管理。

**标签格式:** `key:value`
- key: 字母/数字/下划线/中划线，≤64 字符
- value: 字母/数字/下划线/中划线/点号，≤128 字符
- 每个资产最多 30 个标签
- 同一 key 不可重复

**批量操作:**
- 资产列表勾选多个资产 → [批量添加标签] → 输入 key:value → 确认
- 同理支持 [批量修改标签] 和 [批量删除标签]

**热门标签:**
- 系统统计标签使用频率，在标签输入时展示热门标签推荐
- 用户输入 key 时，自动补全已有的 key 值

**验收标准:**
- AC-1: 标签 CRUD 即时生效
- AC-2: 标签格式校验
- AC-3: 标签重复（同 key）时覆盖旧值
- AC-4: 批量操作支持最多 50 个资产
- AC-5: 热门标签自动补全

---

### 5.2 资产上传与校验

#### 5.2.1 上传流程

**单个上传流程:**

```
用户 ──▶ [+ 上传资产] ──▶ 选择资产类型
                              │
                              ▼
                        填写资产信息
                        ├── 名称（必填）
                        ├── 描述（选填）
                        ├── 分类（必填，联动 asset_type）
                        ├── 标签（选填，key:value）
                        ├── 适用场景（选填）
                        ├── 依赖环境（选填）
                        └── 文件上传区域
                              │
                              ▼
                     前端分片上传到 MinIO
                     （大文件 > 100MB 走分片）
                              │
                              ▼
                    元数据写入 PostgreSQL
                    ├── 生成 asset_uid
                    ├── 初始版本 v1.0
                    ├── 计算文件 SHA-256
                    └── 状态: ACTIVE
                              │
                              ▼
                        上传成功，跳转资产详情
```

**批量上传:**
- 支持拖拽多个文件或选择压缩包（.zip/.tar.gz）
- 压缩包自动解压，按文件扩展名自动识别资产类型
- 批量上传时统一填写分类和标签（可逐个修改）
- 显示上传进度列表（文件名 + 进度条 + 状态）

**支持的文件格式:**

| 资产类型 | 支持格式 | 最大文件大小 |
|---------|---------|------------|
| 模型 | .onnx, .pt, .pth, .pb, .h5, .tflite, .caffemodel | 10 GB |
| 数据集 | .csv, .json, .txt, .zip(图片集), .tar.gz, .parquet | 50 GB |
| 算子 | .py, .cpp, .h, .so, .zip(含依赖) | 1 GB |
| 脚本 | .py, .sh, .bash | 100 MB |
| 流程模板 | .json, .yaml, .yml | 10 MB |

#### 5.2.2 上传校验规则

**Phase 1 — 基础校验（自动执行）:**

| 校验项 | 规则 | 校验时机 |
|--------|------|---------|
| 文件大小 | 不超过类型限制 | 上传前（前端） |
| 文件格式 | 扩展名在支持列表内 | 上传前（前端） |
| 文件完整性 | SHA-256 一致性校验 | 上传后（后端） |
| 名称唯一性 | 同用户同类型不可重名 | 上传后（后端） |

**Phase 3 — 高级校验（异步执行）:**

| 校验项 | 规则 | 说明 |
|--------|------|------|
| 模型可加载 | 尝试用对应框架加载 | ONNX Runtime / PyTorch / TF |
| 数据集完整性 | CSV 列一致性、图片可解码 | 抽样检查前 100 条 |
| 算子可执行 | 语法检查 + import 检查 | Python AST parse |
| 敏感数据检测 | 正则扫描 PII 数据 | 手机号/身份证/邮箱 |

> Phase 3 校验为异步任务，校验完成后更新 asset_versions.validation_status

#### 5.2.3 存储策略

**MinIO 路径规则:**
```
{bucket}/{asset_id}/v{version}/{original_filename}

示例:
ahvp-models/AST-20260409-00001/v1.0/resnet50.onnx
ahvp-datasets/AST-20260409-00002/v1.0/imagenet_val.zip
```

**文件去重:**
- 基于 SHA-256 哈希判断文件是否已存在
- 相同文件不重复存储，仅创建新版本引用

**上传优化:**
- 前端大文件（>100MB）采用分片上传（MinIO multipart upload）
- 分片大小: 64MB
- 支持断点续传
- 并发上传数: 最多 3 个文件同时上传

**验收标准:**
- AC-1: 单文件上传成功，元数据和文件均正确存储
- AC-2: 批量上传（≤20个文件）成功
- AC-3: 压缩包自动解压并识别
- AC-4: 大文件分片上传，断点续传可用
- AC-5: SHA-256 校验确保文件完整性

---

### 5.3 资产版本管理

#### 5.3.1 版本号策略

**版本号格式:** `v{major}.{minor}`

| 操作 | 版本号变化 | 说明 |
|------|-----------|------|
| 首次上传 | v1.0 | 自动分配 |
| 更新文件 | v1.1 → v1.2 → ... | minor 自增 |
| 重大变更 | v1.x → v2.0 | 用户手动指定 major 升级 |

**自动版本号生成规则:**
- 默认每次更新 minor + 1
- 用户可在上传新版本时选择"重大更新"，此时 major + 1, minor 归 0
- 版本号不可自定义为任意值（防止混乱）

#### 5.3.2 版本创建

**User Story:** 作为资产所有者，我需要上传新版本文件来更新资产，同时保留历史版本。

**交互流程:**
1. 资产详情页 → [上传新版本]
2. 选择文件 + 填写版本说明（必填）
3. 可选：勾选"重大更新"（major 升级）
4. 上传完成 → assets.current_version 更新 → 新增 asset_versions 记录

**验收标准:**
- AC-1: 新版本上传后，current_version 自动更新
- AC-2: 历史版本文件保留在 MinIO
- AC-3: 版本说明必填

#### 5.3.3 版本回滚

**User Story:** 作为资产所有者，我需要将资产回滚到任意历史版本。

**回滚流程:**
1. 资产详情页 → 版本历史列表 → 选择目标版本 → [回滚到此版本]
2. 弹出确认对话框："确定将「资产名」回滚到 v1.2？当前版本 v1.5 不会被删除。"
3. 确认后：
   - assets.current_version 更新为目标版本号
   - assets.minio_path 更新为目标版本的文件路径
   - assets.file_size 更新为目标版本的文件大小
   - **不创建新版本记录**，仅切换指针
4. 操作日志记录

**限制:**
- 被锁定的版本不可被回滚覆盖（但可以回滚到锁定版本）
- 回收站中的资产不可操作版本

**验收标准:**
- AC-1: 回滚后 current_version 正确更新
- AC-2: 回滚需要二次确认
- AC-3: 原版本文件不被删除
- AC-4: 操作日志记录回滚行为

#### 5.3.4 版本锁定

**User Story:** 作为管理员或资产所有者，我需要锁定核心版本防止被修改或删除。

**锁定规则:**
- 锁定后：该版本不可修改、不可删除
- 锁定后：仍可查看、下载、复用
- 解锁：只有锁定操作人或管理员可解锁
- 锁定原因：必填（如"线上正在使用的生产版本"）

**验收标准:**
- AC-1: 锁定版本不可删除
- AC-2: 锁定版本可正常查看和复用
- AC-3: 解锁需锁定人或管理员操作
- AC-4: 锁定/解锁记录日志

---

### 5.4 资产检索与复用

#### 5.4.1 多条件检索

**User Story:** 作为用户，我需要通过多种条件组合检索资产，快速找到需要的资源。

**检索维度:**

| 维度 | 字段 | 控件 | 说明 |
|------|------|------|------|
| 关键词 | name, description | 搜索框 | 模糊匹配 + 全文检索 |
| 资产类型 | asset_type | 多选 checkbox | MODEL/DATASET/等 |
| 分类 | category_id | 树形选择器 | 联动左侧分类导航 |
| 标签 | tag_key, tag_value | 标签输入 | 支持多标签 AND 检索 |
| 适用场景 | applicable_scene | 搜索框 | 模糊匹配 |
| 创建人 | owner_id | 用户选择器 | |
| 版本号 | current_version | 文本输入 | 精确匹配 |
| 分享范围 | share_scope | 单选 | PRIVATE/TEAM/PUBLIC |
| 时间范围 | created_at | 日期范围 | |

**排序选项:**
- 相关性（默认，基于关键词匹配度）
- 最新创建
- 最新更新
- 使用频率（reuse_count 降序）
- 文件大小

**全文检索实现（MVP 用 PostgreSQL）:**
```sql
-- 利用 PostgreSQL tsvector + GIN 索引
SELECT * FROM assets 
WHERE to_tsvector('simple', name || ' ' || COALESCE(description, '')) 
      @@ plainto_tsquery('simple', :keyword)
AND status = 'ACTIVE'
ORDER BY ts_rank(...) DESC;
```

> Future: 如果检索性能不足，引入 Elasticsearch。

#### 5.4.2 在线预览

**User Story:** 作为用户，我需要在不下载的情况下快速预览资产内容。

| 资产类型 | 预览方式 | 说明 |
|---------|---------|------|
| 数据集(CSV) | 表格展示前 100 行 | Ant Design Table 组件 |
| 数据集(图片集) | 缩略图画廊 | 展示前 50 张图片缩略图 |
| 脚本 | 只读代码编辑器 | Monaco Editor，语法高亮 |
| 流程模板 | 可视化流程图 | JSON → 流程图渲染 |
| 模型 | 模型信息卡片 | 输入/输出 shape、参数量、算子列表（ONNX） |

> Phase 2 实现基础预览（CSV 表格 + 代码查看），Phase 3 实现完整预览（图片画廊 + 流程图 + 模型信息）

#### 5.4.3 资产复用

**复用场景:**
1. **评测任务创建** — 选择模型/数据集/算子时，从资产库中选取
2. **流程编排** — 拖拽资产到流程节点
3. **下载复用** — 用户下载资产到本地使用

**复用流程（评测任务）:**
```
创建评测任务 → 选择模型 → [从资产库选择]
                              │
                              ▼
                        资产选择弹窗
                        ├── 搜索框
                        ├── 分类筛选
                        ├── 资产列表
                        └── [选择] 按钮
                              │
                              ▼
                    选中 → 关联 asset_id + version
                    记录 asset_reuse_records
```

**复用统计:**
- 资产详情页展示复用次数、复用场景分布
- 全局排行榜：热门资产 Top 20

**验收标准:**
- AC-1: 评测任务创建时可从资产库选择资产
- AC-2: 每次复用生成 reuse_record
- AC-3: 复用统计数据准确
- AC-4: 检索响应时间 ≤ 500ms（100万资产内）

---

### 5.5 资产分享与权限控制

#### 5.5.1 分享模型

**三种分享范围:**

| 范围 | share_scope | 说明 | 可见性 |
|------|------------|------|--------|
| 个人使用 | PRIVATE | 仅创建者可见 | 只有 owner_id 可访问 |
| 团队共享 | TEAM | 所在团队成员可见 | 同 team_id 的用户可访问 |
| 全平台共享 | PUBLIC | 所有注册用户可见 | 所有认证用户可访问 |

**分享操作流程:**
1. 资产详情页 → [分享设置]
2. 选择分享范围：个人/团队/全平台
3. 设置权限级别
4. 确认 → 生成/更新 asset_shares 记录
5. 记录审计日志

#### 5.5.2 权限矩阵

| 权限 | 说明 | PRIVATE | TEAM | PUBLIC |
|------|------|---------|------|--------|
| VIEW | 查看资产信息和预览 | Owner | ✅ 默认 | ✅ 默认 |
| REUSE | 在评测任务中引用 | Owner | ✅ 默认 | ✅ 可配置 |
| EDIT | 修改元数据/上传新版本 | Owner | ❌ 按需授权 | ❌ |
| DOWNLOAD | 下载原始文件 | Owner | ✅ 可配置 | ❌ 可配置 |

**权限继承规则:**
- DOWNLOAD 隐含 VIEW
- EDIT 隐含 VIEW + REUSE
- 全平台共享默认 VIEW + REUSE，管理员可限制为仅 VIEW

#### 5.5.3 分享审计

**审计日志记录:**
- 分享创建/修改/撤销
- 权限变更
- 资产访问（谁在什么时间查看/下载了哪个资产）

**分享撤销:**
- 资产所有者可随时撤销分享
- 撤销后立即生效，已引用的不受影响
- 撤销记录保留在审计日志中

**验收标准:**
- AC-1: PRIVATE 资产仅 owner 可见
- AC-2: TEAM 资产仅同团队成员可见
- AC-3: PUBLIC 资产全平台可见
- AC-4: 权限控制按矩阵执行
- AC-5: 所有分享操作有审计日志
- AC-6: 撤销分享立即生效

---

### 5.6 资产清理与备份

#### 5.6.1 回收站

**删除流程:**
```
用户删除资产 ──▶ 软删除（status='DELETED', deleted_at=NOW()）
                       │
                       ▼
               资产进入回收站
               （列表中不再展示，但数据保留）
                       │
                       ├── 30天内 ──▶ 用户可从回收站恢复
                       │
                       └── 30天后 ──▶ 定时任务永久删除
                                     ├── 删除 PG 记录
                                     └── 删除 MinIO 文件
```

**回收站页面:**
- 展示已删除资产列表（名称、类型、删除人、删除时间、剩余天数）
- 操作：[恢复] [永久删除]
- 永久删除需管理员权限 + 二次确认
- 支持按类型/时间筛选

**批量清理:**
- 管理员可按条件批量清理：
  - 按类型：清理所有过期的某类型资产
  - 按时间：清理 N 天前未使用的资产
  - 按复用频率：清理从未被复用的资产

#### 5.6.2 备份策略

**手动备份（Phase 3）:**
- 管理员可选择备份范围：全量/按分类/按选定资产
- 备份内容：元数据 (PG dump) + 文件 (MinIO 对象)
- 备份存储：MinIO `ahvp-backups` bucket
- 备份文件格式：.tar.gz（元数据 SQL + 文件目录结构）

**恢复流程:**
- 管理员选择备份记录 → [恢复] → 选择恢复策略（覆盖/跳过已存在）
- 恢复前预览：展示将要恢复的资产列表
- 恢复后校验：文件 SHA-256 一致性检查

> **Future:** 自动定时备份（每日凌晨）+ 增量备份

#### 5.6.3 存储监控

**监控指标:**

| 指标 | 来源 | 展示方式 |
|------|------|---------|
| 总存储用量 | MinIO API | 数字 + 进度条 |
| 各类型用量 | PG 聚合 | 饼图 |
| 各用户用量 | PG 聚合 | 排行榜 |
| 最近 30 天增长趋势 | PG 时序聚合 | 折线图 |

**存储告警（Phase 3）:**
- 总用量 > 80%：飞书 WARNING 告警
- 总用量 > 90%：飞书 CRITICAL 告警 + 禁止新上传
- 单用户用量 > 配额 80%：通知用户清理

**验收标准:**
- AC-1: 删除资产进入回收站，30天内可恢复
- AC-2: 回收站永久删除需二次确认
- AC-3: 定时任务自动清理过期回收站资产
- AC-4: 手动备份可成功创建和恢复
- AC-5: 存储用量统计准确

---

## 6. API 设计

### 6.1 资产管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets | 资产列表（分页+筛选+搜索） | P1 |
| POST | /api/assets | 创建资产（含首次上传） | P1 |
| GET | /api/assets/{id} | 资产详情 | P1 |
| PUT | /api/assets/{id} | 编辑资产元数据 | P1 |
| DELETE | /api/assets/{id} | 删除资产（移入回收站） | P1 |
| POST | /api/assets/batch-upload | 批量上传 | P1 |
| GET | /api/assets/{id}/download | 下载资产文件 | P1 |
| POST | /api/assets/{id}/duplicate | 复制资产 | P2 |
| GET | /api/assets/statistics | 资产统计数据（Dashboard） | P1 |

**GET /api/assets 查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 关键词搜索（名称+描述模糊匹配） |
| assetType | string | 资产类型筛选 |
| categoryId | long | 分类 ID |
| tags | string | 标签筛选，格式 `key1:value1,key2:value2` |
| shareScope | string | 分享范围 |
| ownerId | long | 创建人 ID |
| sortBy | string | 排序字段: relevance/created_at/updated_at/reuse_count/file_size |
| sortOrder | string | asc/desc |
| page | int | 页码，默认 1 |
| pageSize | int | 每页数量，默认 20，最大 100 |

**POST /api/assets 请求体:**

```json
{
    "name": "ResNet50 图像分类模型",
    "assetType": "MODEL",
    "categoryId": 101,
    "description": "基于 ImageNet 预训练的 ResNet50 模型",
    "tags": [
        {"key": "framework", "value": "pytorch"},
        {"key": "task", "value": "classification"}
    ],
    "applicableScene": "通用图像分类评测",
    "dependencyEnv": "PyTorch >= 1.12, CUDA >= 11.6",
    "shareScope": "PRIVATE"
}
```

**响应体（通用）:**

```json
{
    "code": 200,
    "message": "success",
    "data": {
        "id": 1,
        "assetUid": "AST-20260409-00001",
        "name": "ResNet50 图像分类模型",
        "assetType": "MODEL",
        "categoryName": "图像分类",
        "currentVersion": "v1.0",
        "fileSize": 102400000,
        "fileFormat": "pt",
        "shareScope": "PRIVATE",
        "tags": [
            {"key": "framework", "value": "pytorch"}
        ],
        "reuseCount": 15,
        "downloadCount": 8,
        "ownerName": "张三",
        "createdAt": "2026-04-09T10:30:00",
        "updatedAt": "2026-04-09T14:20:00"
    }
}
```

### 6.2 版本管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/versions | 版本列表 | P1 |
| POST | /api/assets/{id}/versions | 上传新版本 | P1 |
| GET | /api/assets/{id}/versions/{versionId} | 版本详情 | P1 |
| POST | /api/assets/{id}/versions/{versionId}/rollback | 回滚到指定版本 | P1 |
| PUT | /api/assets/{id}/versions/{versionId}/lock | 锁定/解锁版本 | P1 |

**POST /api/assets/{id}/versions 请求体（multipart/form-data）:**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | ✅ | 新版本文件 |
| versionNote | string | ✅ | 版本说明 |
| majorUpgrade | boolean | ❌ | 是否重大更新（默认 false） |

### 6.3 分类管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/asset-categories | 分类树（层级结构） | P1 |
| POST | /api/asset-categories | 创建分类（管理员） | P1 |
| PUT | /api/asset-categories/{id} | 编辑分类 | P1 |
| DELETE | /api/asset-categories/{id} | 删除分类 | P1 |
| PUT | /api/asset-categories/sort | 批量更新排序 | P1 |

### 6.4 标签管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/tags | 获取资产标签 | P1 |
| PUT | /api/assets/{id}/tags | 更新资产标签（全量替换） | P1 |
| POST | /api/assets/batch-tags | 批量添加标签 | P1 |
| DELETE | /api/assets/batch-tags | 批量删除标签 | P1 |
| GET | /api/asset-tags/popular | 热门标签列表 | P2 |

### 6.5 分享管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/shares | 获取分享设置 | P2 |
| POST | /api/assets/{id}/shares | 创建/更新分享 | P2 |
| DELETE | /api/assets/{id}/shares/{shareId} | 撤销分享 | P2 |
| GET | /api/assets/{id}/share-audit | 分享审计日志 | P2 |

### 6.6 复用管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/reuse-records | 资产复用记录 | P2 |
| POST | /api/assets/{id}/reuse | 记录一次复用 | P2 |
| GET | /api/assets/ranking | 热门资产排行榜 | P2 |

### 6.7 回收站 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/trash | 回收站列表 | P3 |
| POST | /api/assets/trash/{id}/restore | 恢复资产 | P3 |
| DELETE | /api/assets/trash/{id} | 永久删除 | P3 |
| POST | /api/assets/trash/batch-clean | 批量清理 | P3 |

### 6.8 备份管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/asset-backups | 备份列表 | P3 |
| POST | /api/asset-backups | 创建备份 | P3 |
| POST | /api/asset-backups/{id}/restore | 恢复备份 | P3 |
| DELETE | /api/asset-backups/{id} | 删除备份 | P3 |
| GET | /api/assets/storage-stats | 存储统计 | P3 |

### 6.9 预览 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/preview | 在线预览数据 | P2 |
| GET | /api/assets/{id}/preview/thumbnail | 缩略图（图片数据集） | P3 |

---

## 7. 前端页面设计

### 7.1 导航菜单结构

```
📁 数字资产                    ← 一级菜单
├── 📊 资产总览                ← Dashboard
├── 📂 资产列表                ← 主操作页面
├── ⬆️ 资产上传                ← 上传入口
├── 🗑️ 回收站                  ← Phase 3
└── ⚙️ 分类配置                ← 管理员可见
```

### 7.2 页面清单

| 页面 | 路由 | 阶段 | 说明 |
|------|------|------|------|
| 资产总览 Dashboard | /assets/dashboard | P1 | 统计卡片 + 图表 |
| 资产列表 | /assets/list | P1 | 分类导航 + 搜索 + 列表 |
| 资产详情 | /assets/{id} | P1 | 信息 + 版本 + 标签 + 分享 |
| 资产上传 | /assets/upload | P1 | 单个/批量上传 |
| 资产对比 | /assets/compare | P2 | 两个版本/资产并排对比 |
| 回收站 | /assets/trash | P3 | 已删除资产管理 |
| 分类配置 | /assets/categories/settings | P1 | 管理员分类管理 |

### 7.3 资产总览 Dashboard

**布局设计:**

```
┌─────────────────────────────────────────────────────────────────┐
│                        资产总览 Dashboard                        │
├────────────┬────────────┬────────────┬────────────┬─────────────┤
│  📊 总资产数 │  📈 本月新增  │  🔄 复用次数  │  👥 共享资产  │  💾 存储用量  │
│    1,234   │     56     │    892     │    345     │  128.5 GB  │
├────────────┴────────────┴────────────┴────────────┴─────────────┤
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │   资产类型分布（饼图）     │  │   近 30 天上传趋势（折线图）  │ │
│  │                          │  │                              │ │
│  │   🟦 模型 35%             │  │   ────/\──────/\────         │ │
│  │   🟩 数据集 28%           │  │                              │ │
│  │   🟨 算子 18%             │  │                              │ │
│  │   🟥 脚本 12%             │  │                              │ │
│  │   🟪 模板 7%              │  │                              │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │   热门资产 Top 10         │  │   最近上传                    │ │
│  │                          │  │                              │ │
│  │   1. ResNet50    892次   │  │   · model_v2.onnx  5分钟前   │ │
│  │   2. ImageNet    756次   │  │   · test_data.csv  1小时前   │ │
│  │   3. YOLO-v5    634次   │  │   · preprocess.py  2小时前   │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 资产列表页

**布局设计:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 搜索资产...            [资产类型▼] [分享范围▼] [排序▼]        │
│  标签筛选: [+ 添加标签]  framework:pytorch ×  task:classify ×    │
├─────────────┬───────────────────────────────────────────────────┤
│             │                                                   │
│  分类导航    │  ☐ 全选      名称        类型   版本   大小   复用  │
│             │  ├──────────────────────────────────────────────── │
│  ▼ 模型资产  │  ☐ ResNet50  MODEL  v1.3  98MB   892  张三  │
│    图像分类  │  ☐ YOLO-v5   MODEL  v2.0  156MB  634  李四  │
│    目标检测  │  ☐ ImageNet  DATASET v1.1  12GB   756  王五  │
│    语义分割  │  ☐ preproc   OPERATOR v1.0 2KB   234  张三  │
│  ▼ 数据集    │  ☐ test.py   SCRIPT v1.2  5KB    89   赵六  │
│    图像      │                                                   │
│    文本      │  ────────────────────────────────────────────────  │
│    语音      │  [批量操作▼]  共 1,234 条  < 1 2 3 ... 62 >       │
│  ▼ 算子      │                                                   │
│  ▼ 脚本      │  批量操作: [添加标签] [修改分享] [删除] [导出]      │
│  ▼ 模板      │                                                   │
└─────────────┴───────────────────────────────────────────────────┘
```

**交互说明:**
- 左侧分类导航：点击分类自动筛选，支持展开/折叠
- 点击资产名称进入详情
- 列表支持表格视图和卡片视图切换
- 批量操作：勾选后底部出现操作栏

### 7.5 资产详情页

**布局设计:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ← 返回列表    ResNet50 图像分类模型    [编辑] [分享] [删除]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ 基本信息 ──────────────────────────────────────────────────┐ │
│  │ 资产ID: AST-20260409-00001    类型: 模型    分类: 图像分类   │ │
│  │ 当前版本: v1.3                大小: 98 MB   格式: .pt       │ │
│  │ 创建人: 张三                  创建时间: 2026-04-09          │ │
│  │ 分享范围: 🟢 全平台共享        复用次数: 892 次              │ │
│  │ 适用场景: 通用图像分类评测                                    │ │
│  │ 依赖环境: PyTorch >= 1.12, CUDA >= 11.6                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ 标签 ──────────────────────────────────────────────────────┐ │
│  │ framework:pytorch  task:classification  hardware:gpu        │ │
│  │ [+ 添加标签]                                                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Tab: [版本历史] [复用记录] [分享设置] [在线预览] ──────────┐  │
│  │                                                             │  │
│  │  版本历史:                                                   │  │
│  │  ┌───────┬──────────┬────────┬───────┬──────────────────┐   │  │
│  │  │ 版本  │ 上传人    │ 大小   │ 状态  │ 操作              │   │  │
│  │  ├───────┼──────────┼────────┼───────┼──────────────────┤   │  │
│  │  │ v1.3  │ 张三     │ 98MB   │ 当前  │ [下载] [锁定]     │   │  │
│  │  │ v1.2  │ 张三     │ 95MB   │ 🔒锁定 │ [下载] [回滚]     │   │  │
│  │  │ v1.1  │ 李四     │ 92MB   │       │ [下载] [回滚]     │   │  │
│  │  │ v1.0  │ 张三     │ 90MB   │       │ [下载] [回滚]     │   │  │
│  │  └───────┴──────────┴────────┴───────┴──────────────────┘   │  │
│  │                                     [上传新版本]             │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.6 资产上传页

**布局设计:**

```
┌─────────────────────────────────────────────────────────────────┐
│                        上传资产                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: 选择资产类型                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │ 🤖 模型 │ │ 📊 数据集│ │ ⚙️ 算子 │ │ 📜 脚本 │ │ 📋 模板  │        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
│                                                                 │
│  Step 2: 上传文件                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │         📁 拖拽文件到此处，或 [点击选择文件]                │   │
│  │         支持 .onnx, .pt, .pth, .pb, .h5                 │   │
│  │         单文件最大 10GB                                   │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ☐ 批量上传模式（上传压缩包，自动解压识别）                       │
│                                                                 │
│  Step 3: 填写信息                                                │
│  资产名称*: [____________________]                               │
│  描    述: [____________________]                               │
│  分    类*: [图像分类        ▼]                                   │
│  标    签: [key:value ＋]  pytorch:1.12 × cuda:11.6 ×           │
│  适用场景: [____________________]                               │
│  依赖环境: [____________________]                               │
│  分享范围: ○ 个人  ○ 团队  ○ 全平台                              │
│                                                                 │
│                                    [取消]  [确认上传]             │
└─────────────────────────────────────────────────────────────────┘
```

### 7.7 资产对比页（Phase 2）

**用途:** 对比同一资产的两个版本，或对比两个不同资产的元数据和文件差异。

**布局:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     资产对比                                      │
├────────────────────────────┬────────────────────────────────────┤
│       资产 A / 版本 A       │       资产 B / 版本 B              │
│  [选择资产/版本 ▼]          │  [选择资产/版本 ▼]                 │
├────────────────────────────┼────────────────────────────────────┤
│  名称: ResNet50             │  名称: ResNet50                   │
│  版本: v1.2                 │  版本: v1.3                       │
│  大小: 95 MB                │  大小: 98 MB       ← 差异高亮    │
│  格式: .pt                  │  格式: .pt                       │
│  标签: framework:pytorch    │  标签: framework:pytorch          │
│        task:classification  │        task:classification       │
│                             │        speed:optimized ← 新增    │
│  版本说明:                   │  版本说明:                        │
│  修复 batch norm 参数       │  优化推理速度 30%                 │
└────────────────────────────┴────────────────────────────────────┘
```

### 7.8 回收站页面（Phase 3）

```
┌─────────────────────────────────────────────────────────────────┐
│  🗑️ 回收站                                   [清空回收站]        │
├─────────────────────────────────────────────────────────────────┤
│  🔍 搜索...       [资产类型▼] [删除时间▼]                        │
│                                                                 │
│  ☐  名称           类型     删除人   删除时间       剩余天数  操作│
│  ├──────────────────────────────────────────────────────────────│
│  ☐  old_model.pt  MODEL   张三    2026-04-01    22天    [恢复] [永久删除]│
│  ☐  test_v1.csv   DATASET 李四    2026-03-28    19天    [恢复] [永久删除]│
│  ☐  unused.py     SCRIPT  王五    2026-03-15    6天     [恢复] [永久删除]│
│                                                                 │
│  [批量恢复] [批量永久删除]     共 15 条                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. 与其他模块的集成

### 8.1 与评测任务的联动

**评测任务创建时选择资产:**

| 评测任务字段 | 对应资产类型 | 选择方式 |
|-------------|------------|---------|
| 被测模型 | MODEL | 资产选择弹窗 或 手动上传 |
| 测试数据集 | DATASET | 资产选择弹窗 或 手动上传 |
| 评测算子 | OPERATOR | 资产选择弹窗 |
| 评测脚本 | SCRIPT | 资产选择弹窗 |
| 评测流程 | TEMPLATE | 资产选择弹窗 |

**用户可选择：**
1. 从资产库选择已有资产（记录复用）
2. 临时上传新文件（可选同步保存到资产库）

### 8.2 与社区模块的联动

- 全平台共享（PUBLIC）的资产自动同步到社区资产区
- 社区中可浏览、搜索、收藏共享资产
- 社区中可直接复用资产到评测任务

> **此部分需与社区模块 PRD 协同设计，暂列出接口预留**

### 8.3 集成接口预留

```
# 评测模块调用
GET /api/assets/selectable?assetType=MODEL&shareScope=PUBLIC,TEAM

# 社区模块调用
GET /api/assets/public?page=1&pageSize=20&sortBy=reuse_count
```

---

## 9. 实现路线图（6 周 MVP）

### Phase 1 — 基础 CRUD + 分类 + 标签 + 版本管理（2 周）

| 任务 | 交付物 | 预估 |
|------|--------|------|
| 数据库表创建（assets, asset_versions, asset_tags, asset_categories） | DDL + Flyway 迁移 | 0.5 天 |
| 分类管理 CRUD API + 前端 | 分类树管理 | 1 天 |
| 资产 CRUD API（创建/查看/编辑/删除） | RESTful API | 2 天 |
| MinIO 文件上传集成（单文件 + 分片） | 上传服务 | 2 天 |
| 标签系统 CRUD | 标签 API + 前端 | 1 天 |
| 版本管理（创建/回滚/锁定） | 版本 API + 前端 | 2 天 |
| 资产列表页（分类导航 + 搜索） | 前端页面 | 2 天 |
| 资产详情页（基本信息 + 版本历史 + 标签） | 前端页面 | 1 天 |
| 资产上传页 | 前端页面 | 1 天 |
| 资产总览 Dashboard | 前端页面 | 1 天 |

**里程碑:** 资产 CRUD + 分类 + 标签 + 版本管理全链路可用

**Issue 拆分建议:**
- `[Backend] 数字资产 - 数据库表设计与迁移`
- `[Backend] 数字资产 - 分类管理 CRUD API`
- `[Backend] 数字资产 - 资产 CRUD API`
- `[Backend] 数字资产 - MinIO 文件上传集成`
- `[Backend] 数字资产 - 标签系统 CRUD API`
- `[Backend] 数字资产 - 版本管理 API（创建/回滚/锁定）`
- `[Frontend] 数字资产 - 一级菜单 + 路由配置`
- `[Frontend] 数字资产 - 资产列表页（分类导航+搜索+筛选）`
- `[Frontend] 数字资产 - 资产详情页`
- `[Frontend] 数字资产 - 资产上传页`
- `[Frontend] 数字资产 - 资产总览 Dashboard`
- `[Frontend] 数字资产 - 分类配置页（管理员）`

---

### Phase 2 — 检索 + 复用 + 分享 + 权限控制（2 周）

| 任务 | 交付物 | 预估 |
|------|--------|------|
| 多条件组合检索（PG 全文检索 + 多维筛选） | 搜索 API | 2 天 |
| 在线预览 — CSV 表格 + 代码查看器 | 预览 API + 前端 | 2 天 |
| 资产复用对接评测任务 | 资产选择弹窗 + 复用记录 | 2 天 |
| 复用统计与排行榜 | 统计 API + 前端 | 1 天 |
| 分享功能（三种范围 + 权限矩阵） | 分享 API + 前端 | 2 天 |
| 分享审计日志 | 审计 API + 前端 | 1 天 |
| 资产对比页 | 前端页面 | 1 天 |
| 热门标签推荐 | 标签聚合 API | 0.5 天 |

**里程碑:** 检索+复用+分享全链路可用，评测任务可从资产库选择资产

**Issue 拆分建议:**
- `[Backend] 数字资产 - 多条件组合检索 API`
- `[Backend] 数字资产 - 在线预览 API（CSV + 代码）`
- `[Backend] 数字资产 - 资产复用记录与统计 API`
- `[Backend] 数字资产 - 分享管理 API（三种范围+权限）`
- `[Backend] 数字资产 - 分享审计日志 API`
- `[Frontend] 数字资产 - 搜索增强（多维筛选+排序）`
- `[Frontend] 数字资产 - 在线预览组件（表格+代码）`
- `[Frontend] 数字资产 - 资产选择弹窗（评测任务集成）`
- `[Frontend] 数字资产 - 分享设置面板`
- `[Frontend] 数字资产 - 资产对比页`
- `[Frontend] 数字资产 - 复用排行榜`

---

### Phase 3 — 校验 + 预览增强 + 回收站 + 备份 + 存储监控（2 周）

| 任务 | 交付物 | 预估 |
|------|--------|------|
| 自动校验框架（异步任务 + 校验结果） | 校验引擎 | 2 天 |
| 模型校验（ONNX 可加载 / PyTorch 检查） | 校验器 | 1 天 |
| 数据集校验（CSV 完整性 / 图片解码） | 校验器 | 1 天 |
| 预览增强（图片画廊 + 流程图 + 模型信息） | 预览组件 | 2 天 |
| 回收站（软删除 + 恢复 + 定时清理） | 回收站 API + 前端 | 1.5 天 |
| 手动备份与恢复 | 备份 API + 前端 | 1.5 天 |
| 存储监控（用量统计 + 告警） | 监控 API + 前端 | 1 天 |

**里程碑:** 资产管理全功能完成，包含校验、回收、备份、监控

**Issue 拆分建议:**
- `[Backend] 数字资产 - 异步校验框架`
- `[Backend] 数字资产 - 模型文件校验器`
- `[Backend] 数字资产 - 数据集文件校验器`
- `[Backend] 数字资产 - 回收站（软删除+恢复+定时清理）`
- `[Backend] 数字资产 - 备份与恢复 API`
- `[Backend] 数字资产 - 存储用量统计与告警 API`
- `[Frontend] 数字资产 - 预览增强（图片画廊+流程图+模型信息）`
- `[Frontend] 数字资产 - 回收站页面`
- `[Frontend] 数字资产 - 备份管理页面`
- `[Frontend] 数字资产 - 存储监控卡片`

---

### Future — 按需规划

| 功能 | 说明 |
|------|------|
| 语义搜索 | 基于向量检索的资产智能搜索 |
| AI 自动标签 | 基于内容分析自动生成标签 |
| 版本 diff 可视化 | 两个版本文件差异可视化对比 |
| 模型在线推理 | 上传样本直接推理查看效果 |
| 资产定价与计费 | 按存储/使用量收费 |
| 自动定时备份 | 每日凌晨增量备份 |
| 存储配额管理 | 租户级存储配额 |
| Elasticsearch 迁移 | 检索性能不足时引入 ES |
| 资产审批流程 | 全平台共享前需管理员审批 |
| 多租户隔离 | 租户间资产完全隔离 |

---

## 附录 A: 资产 UID 生成规则

**格式:** `AST-{YYYYMMDD}-{5位序号}`

示例: `AST-20260409-00001`, `AST-20260409-00002`

**实现:**
```sql
-- 使用 PG Sequence
CREATE SEQUENCE asset_uid_seq START 1;

-- 生成逻辑（Java）
String uid = String.format("AST-%s-%05d", 
    LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE),
    nextVal("asset_uid_seq"));
```

## 附录 B: MinIO Bucket 初始化脚本

```bash
#!/bin/bash
# 初始化数字资产相关的 MinIO Buckets

MINIO_ALIAS="ahvp"  # mc alias name

# 创建 Buckets
mc mb ${MINIO_ALIAS}/ahvp-models
mc mb ${MINIO_ALIAS}/ahvp-datasets
mc mb ${MINIO_ALIAS}/ahvp-operators
mc mb ${MINIO_ALIAS}/ahvp-scripts
mc mb ${MINIO_ALIAS}/ahvp-templates
mc mb ${MINIO_ALIAS}/ahvp-trash
mc mb ${MINIO_ALIAS}/ahvp-backups

# 设置生命周期规则：trash bucket 30天自动清理
mc ilm rule add ${MINIO_ALIAS}/ahvp-trash --expire-days 30

echo "MinIO Buckets 初始化完成"
```

## 附录 C: 文件格式识别映射表

| 扩展名 | asset_type | file_format | MIME Type |
|--------|-----------|-------------|-----------|
| .onnx | MODEL | onnx | application/octet-stream |
| .pt, .pth | MODEL | pytorch | application/octet-stream |
| .pb | MODEL | tensorflow | application/octet-stream |
| .h5 | MODEL | keras | application/x-hdf5 |
| .tflite | MODEL | tflite | application/octet-stream |
| .csv | DATASET | csv | text/csv |
| .json | DATASET/TEMPLATE | json | application/json |
| .parquet | DATASET | parquet | application/octet-stream |
| .py | OPERATOR/SCRIPT | python | text/x-python |
| .cpp, .h | OPERATOR | cpp | text/x-c++src |
| .yaml, .yml | TEMPLATE | yaml | text/yaml |
| .zip | (auto-detect) | archive | application/zip |
| .tar.gz | (auto-detect) | archive | application/gzip |
