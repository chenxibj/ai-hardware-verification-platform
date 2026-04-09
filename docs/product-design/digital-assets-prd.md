# 数字资产管理模块 PRD v2.0

> **文档版本:** v2.0  
> **创建日期:** 2026-04-09  
> **更新日期:** 2026-04-09  
> **作者:** 菜菜子（产品经理）  
> **状态:** 评审通过，进入开发  
> **目标读者:** 前后端开发、架构师、测试团队、产品  
> **关联文档:** product-design-v3.2.md 第 2.4 节（数字资产管理）  
> **关联模块:** 评测任务管理（资产引用）、社区模块（资产展示）、资源管理（存储后端）

---

## 变更记录

| 版本 | 日期 | 变更内容 | 决策来源 |
|------|------|---------|---------|
| v1.0 | 2026-04-09 | 初版：数字资产独立菜单设计，三阶段 MVP 路线图 | chenxi 需求 + 菜菜子设计 |
| v2.0 | 2026-04-09 | 评审反馈合入：RBAC 权限矩阵、评测任务联动交互、Phase 1 压缩包解压移至 Phase 2、分享粒度细化、三段式 semver 版本号、存储配额管理、中文分词方案、回收站定时清理方案、ONNX 校验提前到 Phase 2；贡献管理标注 Future | 麦克雷评审反馈 + chenxi 决策 |

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
4. **安全分享** — 支持个人/团队/全平台三种分享范围 + 指定用户/角色精细化权限控制
5. **存储可控** — 回收站机制 + 自动备份 + 存储配额管理 + 存储监控告警

### 1.3 范围（MVP 裁剪后）

| 在 MVP 范围内 | 推迟到 Future |
|--------------|--------------|
| 五大类资产 CRUD + 分类管理 | 资产智能推荐（基于使用记录） |
| 自定义标签系统（key:value） | AI 自动标签（基于内容分析） |
| 版本管理（三段式 semver + 创建/回滚/锁定） | 版本 diff 可视化对比 |
| 基础文件上传（多文件并行上传） | 语义搜索（向量检索） |
| 多条件组合检索（含中文分词） | 模型在线推理预览 |
| 在线预览（数据集/脚本/模板） | 资产定价与计费 |
| 三种分享范围 + 指定用户/角色权限控制 | 分享审批流程 |
| 回收站 + 定时清理 + 手动备份 | 自动定时备份 + 增量备份 |
| 存储配额管理 + 超限告警 | 贡献管理体系（待整体规划后补充） |
| 压缩包批量上传（Phase 2） | Elasticsearch 迁移 |
| ONNX 可加载校验（Phase 2） | 多租户隔离 |

> **Future: 贡献管理体系待整体规划后补充**（贡献者视角管理、贡献排行榜、与社区联动等）

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

## 3. 权限矩阵（RBAC 集成）

> **详细 RBAC 集成待用户权限体系整体设计完成后对接。** 以下为资产模块的角色-操作权限映射简表。

| 操作 | 超级管理员 | 平台管理员 | 租户管理员 | 资产管理员 | 评测专员 | 普通用户 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| 资产查看（列表/详情） | ✅ | ✅ | ✅（本租户） | ✅ | ✅ | ✅（本人+共享） |
| 资产创建/上传 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 资产编辑（元数据） | ✅ | ✅ | ✅（本租户） | ✅ | ❌ | ✅（本人） |
| 资产删除 | ✅ | ✅ | ✅（本租户） | ✅ | ❌ | ✅（本人） |
| 版本管理（上传新版/回滚） | ✅ | ✅ | ✅（本租户） | ✅ | ❌ | ✅（本人） |
| 版本锁定/解锁 | ✅ | ✅ | ✅（本租户） | ✅ | ❌ | ❌ |
| 分享设置 | ✅ | ✅ | ✅（本租户） | ✅ | ❌ | ✅（本人） |
| 分类配置（增删改） | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 回收站永久删除 | ✅ | ✅ | ✅（本租户） | ❌ | ❌ | ❌ |
| 备份与恢复 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 存储配额管理 | ✅ | ✅ | ✅（本租户） | ❌ | ❌ | ❌ |
| 资产复用（引用到评测任务） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅（可见范围内） |
| 资产下载 | ✅ | ✅ | ✅ | ✅ | ✅（按分享权限） | ✅（按分享权限） |

---

## 4. 系统架构

### 4.1 数字资产管理整体架构

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
│ - 上传校验  │ │          │ │- 复用记录│ │          │ │- 配额管理│
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
│  │  - plan_asset_refs 表     │  │                               │   │
│  └───────────────────────────┘  └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 资产存储策略

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

## 5. 数据库设计

### 5.1 核心表结构

**asset_categories（资产分类表）**

```sql
CREATE TABLE asset_categories (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    parent_id   BIGINT REFERENCES asset_categories(id),
    asset_type  VARCHAR(20) NOT NULL,
    sort_order  INT DEFAULT 0,
    icon        VARCHAR(50),
    description TEXT,
    created_by  BIGINT,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(name, parent_id)
);

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
    asset_uid       VARCHAR(32) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    asset_type      VARCHAR(20) NOT NULL,
    category_id     BIGINT REFERENCES asset_categories(id),
    description     TEXT,
    current_version VARCHAR(20) DEFAULT 'v1.0.0',
    file_size       BIGINT DEFAULT 0,
    file_format     VARCHAR(50),
    minio_bucket    VARCHAR(100),
    minio_path      VARCHAR(500),
    applicable_scene TEXT,
    dependency_env  TEXT,
    share_scope     VARCHAR(20) DEFAULT 'PRIVATE',
    status          VARCHAR(20) DEFAULT 'ACTIVE',
    download_count  INT DEFAULT 0,
    reuse_count     INT DEFAULT 0,
    owner_id        BIGINT NOT NULL,
    team_id         BIGINT,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_category ON assets(category_id);
CREATE INDEX idx_assets_owner ON assets(owner_id);
CREATE INDEX idx_assets_share ON assets(share_scope, status);
CREATE INDEX idx_assets_status ON assets(status);
-- 中文全文检索索引（需配置 zhparser 或 pg_jieba 插件）
-- CREATE INDEX idx_assets_name ON assets USING gin(to_tsvector('zhparser', name));
-- 降级方案：使用 simple 配置（无中文分词）
CREATE INDEX idx_assets_name ON assets USING gin(to_tsvector('simple', name));
```

**asset_versions（资产版本表）**

```sql
CREATE TABLE asset_versions (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        BIGINT NOT NULL REFERENCES assets(id),
    version         VARCHAR(20) NOT NULL,            -- 三段式 semver: v{major}.{minor}.{patch}
    version_note    TEXT,
    file_size       BIGINT DEFAULT 0,
    file_hash       VARCHAR(128),
    minio_path      VARCHAR(500) NOT NULL,
    is_locked       BOOLEAN DEFAULT FALSE,
    locked_by       BIGINT,
    locked_at       TIMESTAMP,
    lock_reason     TEXT,
    validation_status VARCHAR(20) DEFAULT 'PENDING',
    validation_detail JSONB,
    created_by      BIGINT NOT NULL,
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
    tag_key     VARCHAR(64) NOT NULL,
    tag_value   VARCHAR(128) NOT NULL,
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
    shared_by       BIGINT NOT NULL,
    shared_to_type  VARCHAR(20) NOT NULL,            -- USER/TEAM/ROLE/PUBLIC
    shared_to_id    BIGINT,                          -- 目标用户、团队或角色 ID（PUBLIC 时为 NULL）
    permission      VARCHAR(20) NOT NULL,            -- VIEW/REUSE/EDIT/DOWNLOAD
    is_revoked      BOOLEAN DEFAULT FALSE,
    revoked_at      TIMESTAMP,
    revoked_by      BIGINT,
    expires_at      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shares_asset ON asset_shares(asset_id);
CREATE INDEX idx_shares_target ON asset_shares(shared_to_type, shared_to_id);
```

**plan_asset_refs（评测任务-资产关联表）** *(v2.0 新增)*

```sql
CREATE TABLE plan_asset_refs (
    id              BIGSERIAL PRIMARY KEY,
    plan_id         BIGINT NOT NULL,                 -- 评测任务 ID
    asset_id        BIGINT NOT NULL REFERENCES assets(id),
    asset_version   VARCHAR(20),                     -- 引用的资产版本
    ref_type        VARCHAR(50) NOT NULL,            -- MODEL/DATASET/OPERATOR/SCRIPT/TEMPLATE
    is_temp_upload  BOOLEAN DEFAULT FALSE,           -- 是否为临时上传（非资产库已有）
    created_by      BIGINT NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(plan_id, asset_id, ref_type)
);

CREATE INDEX idx_plan_asset_plan ON plan_asset_refs(plan_id);
CREATE INDEX idx_plan_asset_asset ON plan_asset_refs(asset_id);
```

**asset_reuse_records（资产复用记录表）**

```sql
CREATE TABLE asset_reuse_records (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        BIGINT NOT NULL REFERENCES assets(id),
    asset_version   VARCHAR(20),
    reuse_type      VARCHAR(50) NOT NULL,
    reuse_target_id BIGINT,
    reuse_target_name VARCHAR(200),
    user_id         BIGINT NOT NULL,
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
    action          VARCHAR(50) NOT NULL,
    actor_id        BIGINT NOT NULL,
    detail          JSONB,
    ip_address      VARCHAR(45),
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
    backup_type     VARCHAR(20) NOT NULL,
    scope           VARCHAR(20) NOT NULL,
    scope_detail    JSONB,
    minio_path      VARCHAR(500) NOT NULL,
    file_size       BIGINT DEFAULT 0,
    asset_count     INT DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'IN_PROGRESS',
    created_by      BIGINT,
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 5.2 ER 关系图

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
assets (1) ──────< (N) plan_asset_refs ──────> (1) plans
```

---

## 6. 核心功能设计

### 6.1 资产分类管理

#### 6.1.1 分类体系

**预置五大类及默认细分:**

| 大类 | asset_type | 默认细分类型 |
|------|-----------|------------|
| 模型资产 | MODEL | 图像分类、目标检测、语义分割、自然语言处理、语音识别、推荐系统、其他 |
| 数据集资产 | DATASET | 图像数据集、文本数据集、语音数据集、表格数据集、多模态数据集、其他 |
| 算子资产 | OPERATOR | 前处理算子、后处理算子、推理算子、数据转换算子、自定义算子、其他 |
| 脚本资产 | SCRIPT | 评测脚本、数据处理脚本、性能测试脚本、部署脚本、工具脚本、其他 |
| 流程模板资产 | TEMPLATE | 标准评测流程、性能基准流程、回归测试流程、自定义流程、其他 |

#### 6.1.2 分类配置（管理员功能）

**验收标准:**
- AC-1: 管理员可增删改细分分类
- AC-2: 顶级五大类不可删除
- AC-3: 删除有资产的分类时阻止并提示
- AC-4: 分类变更即时生效，已有资产不受影响

#### 6.1.3 标签系统

**标签格式:** `key:value`
- key: 字母/数字/下划线/中划线，≤64 字符
- value: 字母/数字/下划线/中划线/点号，≤128 字符
- 每个资产最多 30 个标签
- 同一 key 不可重复

**批量操作:** 资产列表勾选多个资产 → 批量添加/修改/删除标签（最多 50 个资产）

**热门标签:** 系统统计标签使用频率，标签输入时展示热门标签推荐+自动补全

---

### 6.2 资产上传与校验

#### 6.2.1 上传流程

**Phase 1 — 多文件并行上传（不含压缩包解压）:**
- 前端 Dragger 组件支持拖拽多个文件
- 并行上传，最多 3 个文件同时上传
- 每个文件显示独立进度条 + 状态
- 批量上传时统一填写分类和标签（可逐个修改）

**Phase 2 — 压缩包批量上传:**
- 支持 .zip/.tar.gz 压缩包
- 自动解压，按文件扩展名自动识别资产类型
- 处理嵌套目录、错误处理

**支持的文件格式:**

| 资产类型 | 支持格式 | 最大文件大小 |
|---------|---------|------------|
| 模型 | .onnx, .pt, .pth, .pb, .h5, .tflite, .caffemodel | 10 GB |
| 数据集 | .csv, .json, .txt, .zip(图片集), .tar.gz, .parquet | 50 GB |
| 算子 | .py, .cpp, .h, .so, .zip(含依赖) | 1 GB |
| 脚本 | .py, .sh, .bash | 100 MB |
| 流程模板 | .json, .yaml, .yml | 10 MB |

#### 6.2.2 上传校验规则

**Phase 1 — 基础校验（自动执行）:**

| 校验项 | 规则 | 校验时机 |
|--------|------|---------|
| 文件大小 | 不超过类型限制 | 上传前（前端） |
| 文件格式 | 扩展名在支持列表内 | 上传前（前端） |
| 文件完整性 | SHA-256 一致性校验 | 上传后（后端） |
| 名称唯一性 | 同用户同类型不可重名 | 上传后（后端） |

**Phase 2 — ONNX 模型可加载校验:**

| 校验项 | 规则 | 说明 |
|--------|------|------|
| ONNX 模型可加载 | 尝试用 ONNX Runtime 加载 | ≤30s 超时，异步任务 |

**Phase 3 — 完整校验（异步执行）:**

| 校验项 | 规则 | 说明 |
|--------|------|------|
| 数据集完整性 | CSV 列一致性、图片可解码 | 抽样检查前 100 条 |
| 算子可执行 | 语法检查 + import 检查 | Python AST parse |
| 敏感数据检测 | 正则扫描 PII 数据 | 手机号/身份证/邮箱 |

#### 6.2.3 存储策略

**MinIO 路径规则:**
```
{bucket}/{asset_id}/v{version}/{original_filename}

示例:
ahvp-models/AST-20260409-00001/v1.0.0/resnet50.onnx
ahvp-datasets/AST-20260409-00002/v1.0.0/imagenet_val.zip
```

**文件去重:** 基于 SHA-256 哈希判断，相同文件不重复存储。

**上传优化:**
- 大文件（>100MB）采用分片上传（MinIO multipart upload），分片大小 64MB
- 支持断点续传
- 并发上传数: 最多 3 个文件同时上传

---

### 6.3 资产版本管理

#### 6.3.1 版本号策略

**版本号格式:** `v{major}.{minor}.{patch}`（三段式语义化版本号 semver）

| 操作 | 版本号变化 | 说明 |
|------|-----------|------|
| 首次上传 | v1.0.0 | 自动分配 |
| 修订更新 | v1.0.0 → v1.0.1 → v1.0.2 | patch 自增 |
| 功能更新 | v1.0.x → v1.1.0 | minor 自增，patch 归 0 |
| 重大变更 | v1.x.x → v2.0.0 | major 自增，minor/patch 归 0 |

**版本号规则:**
- 默认每次更新 patch + 1
- 用户可在上传新版本时**自定义版本号**（需校验格式 + 唯一性）
- 版本号格式校验：`^v\d+\.\d+\.\d+$`
- 版本号唯一性校验：同一资产内不可重复

#### 6.3.2 版本创建

**交互流程:**
1. 资产详情页 → [上传新版本]
2. 选择文件 + 填写版本说明（必填）+ 版本号（默认自增，可自定义）
3. 上传完成 → assets.current_version 更新 → 新增 asset_versions 记录

#### 6.3.3 版本回滚

**回滚流程:**
1. 资产详情页 → 版本历史列表 → 选择目标版本 → [回滚到此版本]
2. 确认对话框
3. 更新 assets.current_version / minio_path / file_size
4. **不创建新版本记录**，仅切换指针

**限制:** 被锁定的版本不可被回滚覆盖（但可以回滚到锁定版本）

#### 6.3.4 版本锁定

**规则:**
- 锁定后：不可修改、不可删除，但可查看/下载/复用
- 解锁：只有锁定操作人或管理员可解锁
- 锁定原因必填

---

### 6.4 资产检索与复用

#### 6.4.1 多条件检索

**检索维度:**

| 维度 | 字段 | 控件 |
|------|------|------|
| 关键词 | name, description | 搜索框（模糊匹配 + 全文检索） |
| 资产类型 | asset_type | 多选 checkbox |
| 分类 | category_id | 树形选择器 |
| 标签 | tag_key, tag_value | 标签输入（多标签 AND 检索） |
| 适用场景 | applicable_scene | 搜索框 |
| 创建人 | owner_id | 用户选择器 |
| 版本号 | current_version | 文本输入 |
| 分享范围 | share_scope | 单选 |
| 时间范围 | created_at | 日期范围 |

**全文检索实现（PostgreSQL）:**

> **注意:** 中文搜索需要配置 zhparser 或 pg_jieba 插件。未安装插件前使用 simple 配置降级。
> **性能承诺:** 10万资产内 500ms（基于 PG 全文检索）。超过 10 万资产需评估引入 Elasticsearch。

```sql
SELECT * FROM assets 
WHERE to_tsvector('zhparser', name || ' ' || COALESCE(description, '')) 
      @@ plainto_tsquery('zhparser', :keyword)
AND status = 'ACTIVE'
ORDER BY ts_rank(...) DESC;
```

#### 6.4.2 在线预览

| 资产类型 | 预览方式 | 阶段 |
|---------|---------|------|
| 数据集(CSV) | 表格展示前 100 行 | P2 |
| 脚本 | 只读代码编辑器（Monaco Editor） | P2 |
| 流程模板 | 可视化流程图 | P3 |
| 数据集(图片集) | 缩略图画廊 | P3 |
| 模型 | 模型信息卡片（shape/参数量/算子列表） | P3 |

#### 6.4.3 资产复用

**复用场景:**
1. **评测任务创建** — 从资产库选择模型/数据集/算子
2. **流程编排** — 拖拽资产到流程节点
3. **下载复用** — 下载到本地

**复用统计:** 资产详情页展示复用次数、复用场景分布。全局排行榜：热门资产 Top 20。

---

### 6.5 评测任务联动设计 *(v2.0 新增)*

#### 6.5.1 资产选择器组件

**交互设计:**

评测任务创建表单中，模型/数据集/算子/脚本/模板字段旁增加「从资产库选择」按钮：

```
┌─────────────────────────────────────────────────────┐
│  被测模型:  [________________] [从资产库选择] [上传]   │
│  测试数据集: [________________] [从资产库选择] [上传]   │
│  评测算子:  [________________] [从资产库选择]          │
│  评测脚本:  [________________] [从资产库选择]          │
│  评测流程:  [________________] [从资产库选择]          │
└─────────────────────────────────────────────────────┘
```

**资产选择弹窗:**

```
┌──────────────────────────────────────────────────────┐
│  从资产库选择模型                              [×]    │
├──────────────────────────────────────────────────────┤
│  🔍 搜索资产...   [分类▼] [标签▼] [版本▼]            │
│                                                      │
│  ☐ ResNet50 v1.3.0  | 图像分类 | 98MB | 张三        │
│  ☐ YOLO-v5  v2.0.0  | 目标检测 | 156MB | 李四       │
│  ☐ MobileNet v1.0.0 | 图像分类 | 45MB | 王五        │
│                                                      │
│  [选择版本: v1.3.0 ▼]                                │
│                                                      │
│              [取消]  [确认选择]                        │
└──────────────────────────────────────────────────────┘
```

**筛选维度:** 资产类型（自动锁定）、分类、标签、版本、关键词搜索

#### 6.5.2 临时上传 + 同步保存

用户也可在创建评测任务时直接上传文件：
1. 点击「上传」→ 选择文件
2. 可选勾选「同步保存到资产库」
3. 勾选后填写资产名称、分类、标签等元数据
4. 文件同时保存到评测任务 + 资产库

#### 6.5.3 关联关系

评测任务与资产通过 `plan_asset_refs` 表关联（见 5.1 数据库设计），支持：
- 一个评测任务引用多个资产
- 同一资产被多个评测任务引用
- 记录引用的具体版本号
- 标记是否为临时上传

---

### 6.6 资产分享与权限控制

#### 6.6.1 分享模型

**三种基础分享范围 + 指定用户/角色:**

| 范围 | share_scope | 说明 |
|------|------------|------|
| 个人使用 | PRIVATE | 仅创建者可见 |
| 团队共享 | TEAM | 所在团队成员可见 |
| 全平台共享 | PUBLIC | 所有注册用户可见 |

**Phase 2 扩展 — 指定用户/角色分享:**
- 选择具体用户 ID 列表（shared_to_type = 'USER'）
- 选择具体角色（shared_to_type = 'ROLE'，如仅对评测专员可见）

> **Future: 分享审批流程** — 全平台共享前需管理员审批。

#### 6.6.2 权限矩阵

| 权限 | 说明 | PRIVATE | TEAM | PUBLIC |
|------|------|---------|------|--------|
| VIEW | 查看资产信息和预览 | Owner | ✅ 默认 | ✅ 默认 |
| REUSE | 在评测任务中引用 | Owner | ✅ 默认 | ✅ 可配置 |
| EDIT | 修改元数据/上传新版本 | Owner | ❌ 按需授权 | ❌ |
| DOWNLOAD | 下载原始文件 | Owner | ✅ 可配置 | ❌ 可配置 |

#### 6.6.3 分享审计

所有分享操作记录审计日志：分享创建/修改/撤销、权限变更、资产访问。

---

### 6.7 资产清理与备份

#### 6.7.1 回收站

**删除流程:**
```
用户删除资产 ──▶ 软删除（status='DELETED', deleted_at=NOW()）
                       │
                       ├── 30天内 ──▶ 用户可从回收站恢复
                       │
                       └── 30天后 ──▶ 定时任务永久删除
                                     ├── 删除 MinIO 文件
                                     └── 删除 PG 记录
```

**定时清理方案（Spring @Scheduled）:**

```java
@Component
@Slf4j
public class TrashCleanupTask {
    
    @Scheduled(cron = "0 0 2 * * ?")  // 每日凌晨 2:00 执行
    public void cleanExpiredTrash() {
        log.info("开始清理过期回收站资产...");
        // 1. 查询 deleted_at < NOW() - INTERVAL '30 days' 的记录
        // 2. 逐条删除 MinIO 文件
        // 3. 删除 PG 记录（asset_versions, asset_tags 级联删除）
        // 4. 记录清理日志
        log.info("清理完成，共清理 {} 条记录", count);
    }
}
```

**执行顺序:** 先删除 MinIO 文件 → 再删除 PG 记录（保持一致性，失败可重试）

#### 6.7.2 备份策略

**手动备份（Phase 3）:**
- 管理员可选择备份范围：全量/按分类/按选定资产
- 备份内容：元数据 (PG dump) + 文件 (MinIO 对象)
- 备份存储：MinIO `ahvp-backups` bucket

> **Future:** 自动定时备份（每日凌晨）+ 增量备份

#### 6.7.3 存储配额管理 *(v2.0 新增, Phase 2)*

**租户级存储配额:**
- 管理员配置每个租户的存储上限（默认 100GB）
- 用户级配额（可选，由租户管理员配置）

**超配额处理:**
- 配额使用率 ≥ 80%：系统通知提醒清理
- 配额使用率 ≥ 90%：告警通知 + 标记预警状态
- 配额使用率 = 100%：阻止新文件上传，提示"存储配额已满"

**配额查询 API:** `GET /api/storage/quota?tenantId={id}`

#### 6.7.4 存储监控

**监控指标:**

| 指标 | 来源 | 展示方式 |
|------|------|---------|
| 总存储用量 | MinIO API | 数字 + 进度条 |
| 各类型用量 | PG 聚合 | 饼图 |
| 各用户用量 | PG 聚合 | 排行榜 |
| 近 30 天增长趋势 | PG 时序聚合 | 折线图 |

**存储告警（Phase 3）:**
- 总用量 > 80%：飞书 WARNING 告警
- 总用量 > 90%：飞书 CRITICAL 告警 + 禁止新上传
- 单用户用量 > 配额 80%：通知用户清理

---

## 7. API 设计

### 7.1 资产管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets | 资产列表（分页+筛选+搜索） | P1 |
| POST | /api/assets | 创建资产（含首次上传） | P1 |
| GET | /api/assets/{id} | 资产详情 | P1 |
| PUT | /api/assets/{id} | 编辑资产元数据 | P1 |
| DELETE | /api/assets/{id} | 删除资产（移入回收站） | P1 |
| POST | /api/assets/upload | 文件上传 | P1 |
| GET | /api/assets/{id}/download | 下载资产文件 | P1 |
| GET | /api/assets/stats | 资产统计 | P1 |

### 7.2 版本管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/versions | 版本列表 | P1 |
| POST | /api/assets/{id}/versions | 上传新版本 | P1 |
| POST | /api/assets/{id}/versions/{versionId}/rollback | 回滚 | P1 |
| PUT | /api/assets/{id}/versions/{versionId}/lock | 锁定/解锁 | P1 |

### 7.3 分类管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/asset-categories | 分类树 | P1 |
| POST | /api/asset-categories | 创建分类 | P1 |
| PUT | /api/asset-categories/{id} | 编辑分类 | P1 |
| DELETE | /api/asset-categories/{id} | 删除分类 | P1 |

### 7.4 标签管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/tags | 获取标签 | P1 |
| PUT | /api/assets/{id}/tags | 更新标签 | P1 |
| GET | /api/asset-tags/popular | 热门标签 | P2 |

### 7.5 分享管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/shares | 分享设置 | P2 |
| POST | /api/assets/{id}/shares | 创建/更新分享 | P2 |
| DELETE | /api/assets/{id}/shares/{shareId} | 撤销分享 | P2 |

### 7.6 复用管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/{id}/reuse-records | 复用记录 | P2 |
| POST | /api/assets/{id}/reuse | 记录复用 | P2 |
| GET | /api/assets/ranking | 排行榜 | P2 |

### 7.7 回收站 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/assets/trash | 回收站列表 | P3 |
| POST | /api/assets/trash/{id}/restore | 恢复 | P3 |
| DELETE | /api/assets/trash/{id} | 永久删除 | P3 |

### 7.8 存储配额 API *(v2.0 新增)*

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/storage/quota | 查询配额 | P2 |
| PUT | /api/storage/quota | 设置配额 | P2 |
| GET | /api/assets/storage-stats | 存储统计 | P3 |

---

## 8. 前端页面设计

### 8.1 导航菜单结构

```
📁 数字资产                    ← 一级菜单
├── 📂 资产列表                ← 主操作页面（含分类导航+搜索+统计卡片）
├── ⬆️ 资产上传                ← 上传入口
├── 🗑️ 回收站                  ← Phase 3
└── ⚙️ 分类配置                ← 管理员可见
```

### 8.2 页面清单

| 页面 | 路由 | 阶段 |
|------|------|------|
| 资产列表（含 Dashboard 统计卡片） | /assets | P1 |
| 资产详情 | /assets/{id} | P1 |
| 资产上传 | /assets/upload | P1 |
| 回收站 | /assets/trash | P3 |

### 8.3 – 8.8 页面 Wireframe

*(保持 v1.0 设计不变，详见 v1.0 文档存档)*

---

## 9. 实现路线图（6 周 MVP）

### Phase 1 — 基础 CRUD + 分类 + 标签 + 版本管理 + 多文件上传（2 周，P0）

| 任务 | 交付物 | 预估 |
|------|--------|------|
| 资产 CRUD API（创建/查看/编辑/删除） | RESTful API | 2 天 |
| 分类管理 CRUD API + 前端 | 分类树管理 | 1 天 |
| 标签系统 CRUD | 标签 API + 前端 | 1 天 |
| 版本管理（三段式 semver + 创建/回滚/锁定） | 版本 API + 前端 | 2 天 |
| 多文件并行上传（前端 Dragger + 进度条，**不含压缩包解压**） | 上传组件 | 2 天 |
| 资产列表页（分类导航 + 搜索 + 统计卡片） | 前端页面 | 2 天 |
| 资产详情页（基本信息 + 版本历史 + 标签） | 前端页面 | 1 天 |
| 资产上传页 | 前端页面 | 1 天 |
| 路由注册 + 一级菜单配置 | 前端配置 | 0.5 天 |

**里程碑:** 资产 CRUD + 分类 + 标签 + 版本管理 + 多文件上传全链路可用

---

### Phase 2 — 检索 + 复用 + 分享 + 压缩包上传 + 配额 + ONNX 校验（2 周，P1）

| 任务 | 交付物 | 预估 |
|------|--------|------|
| 多条件组合检索（PG 全文检索 + 中文分词 zhparser/pg_jieba） | 搜索 API | 2 天 |
| 在线预览 — CSV 表格 + 代码查看器 | 预览 API + 前端 | 2 天 |
| 资产复用对接评测任务 + 资产选择器组件 | 弹窗 + 复用记录 | 2 天 |
| 评测任务临时上传 + 同步保存到资产库 | 联动功能 | 1 天 |
| 分享功能（三种范围 + 指定用户/角色 + 权限矩阵） | 分享 API + 前端 | 2 天 |
| 压缩包批量上传（自动解压 + 识别资产类型） | 上传增强 | 1 天 |
| 存储配额管理（租户级配额 + 超配额阻止 + 80%/90% 预警） | 配额 API + 前端 | 1 天 |
| ONNX 模型可加载校验（异步任务） | 校验器 | 1 天 |

**里程碑:** 检索+复用+分享+压缩包上传+配额管理+ONNX 校验全链路可用

---

### Phase 3 — 完整校验 + 回收站 + 备份 + 监控（2 周，P2）

| 任务 | 交付物 | 预估 |
|------|--------|------|
| 数据集校验（CSV 完整性 / 图片解码抽样） | 校验器 | 1 天 |
| 预览增强（图片画廊 + 流程图 + 模型信息） | 预览组件 | 2 天 |
| 回收站（软删除 + 恢复 + Spring @Scheduled 每日凌晨自动清理） | 回收站 API + 前端 + 定时任务 | 2 天 |
| 手动备份与恢复 | 备份 API + 前端 | 1.5 天 |
| 存储监控（用量统计 + 趋势图 + 告警） | 监控 API + 前端 | 1.5 天 |
| 分享审计日志 | 审计 API + 前端 | 1 天 |

**里程碑:** 资产管理全功能完成，包含校验、回收、备份、监控

---

### Future — 按需规划

| 功能 | 说明 |
|------|------|
| 贡献管理体系 | 贡献者视角管理、贡献排行榜、与社区联动（待整体规划后补充） |
| 分享审批流程 | 全平台共享前需管理员审批 |
| 语义搜索 | 基于向量检索的资产智能搜索 |
| AI 自动标签 | 基于内容分析自动生成标签 |
| 版本 diff 可视化 | 两个版本文件差异可视化对比 |
| 模型在线推理 | 上传样本直接推理查看效果 |
| 资产定价与计费 | 按存储/使用量收费 |
| 自动定时备份 | 每日凌晨增量备份 |
| Elasticsearch 迁移 | 检索性能不足时引入 ES |
| 多租户隔离 | 租户间资产完全隔离 |

---

## 附录 A: 资产 UID 生成规则

**格式:** `AST-{YYYYMMDD}-{5位序号}`

示例: `AST-20260409-00001`, `AST-20260409-00002`

## 附录 B: MinIO Bucket 初始化脚本

```bash
#!/bin/bash
MINIO_ALIAS="ahvp"
mc mb ${MINIO_ALIAS}/ahvp-models
mc mb ${MINIO_ALIAS}/ahvp-datasets
mc mb ${MINIO_ALIAS}/ahvp-operators
mc mb ${MINIO_ALIAS}/ahvp-scripts
mc mb ${MINIO_ALIAS}/ahvp-templates
mc mb ${MINIO_ALIAS}/ahvp-trash
mc mb ${MINIO_ALIAS}/ahvp-backups
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
