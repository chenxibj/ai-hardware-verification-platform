# 验证平台社区模块设计文档（PRD 模块3）

> **版本**: v1.0  
> **日期**: 2026-05-18  
> **作者**: 菜菜子 (AI PM)  
> **状态**: Draft — 待 chenxi review  
> **关联**: PRD §模块3（验证平台社区）、Gap Analysis 2026-05-08

---

## 1. 目标与范围

### 1.1 要解决什么问题

PRD 将社区定位为 **"平台唯一生态流量入口，纯公益免费属性"**，需提供评测榜单、免费资源下载、内容发布、问答交流、需求撮合等功能。

当前状态：
- ✅ **已有骨架**：LeaderboardController（评测榜单，基于 ChipReport 数据）、CommunityResourceController（资源下载，有完整 Entity + Repository）
- ⚠️ **仅有 stub**：PostController / DemandController 返回空数据，无持久化
- ⚠️ **前端半成品**：Community.js（文章列表+发布）、Forum.js、CommunityResources.js 有 UI，但后端 API 不完整
- ❌ **完全缺失**：审核机制、积分体系、评论/收藏、问答流程、个性化推荐、团队管理

### 1.2 目标

按 PRD 时间线，社区平台 **2027.06 开发完成**，距今约 13 个月。本设计文档规划分阶段交付：

| 阶段 | 时间 | 范围 | 优先级 |
|------|------|------|--------|
| Phase 1 (MVP) | 2026.10-11 | 内容发布 + 资源下载 + 基础互动 | P0 |
| Phase 2 | 2026.12-2027.02 | 问答系统 + 需求对接 + 审核机制 | P1 |
| Phase 3 | 2027.03-05 | 积分体系 + 个性化推荐 + 社区运营 | P2 |

### 1.3 不包含

- 评测系统核心功能（已有独立模块）
- 用户体系改造（PRD 模块4，独立设计文档）
- 异构资源纳管（PRD 模块5，独立设计文档）

---

## 2. 现状分析

### 2.1 已有代码盘点

| 组件 | 路径 | 状态 | 说明 |
|------|------|------|------|
| `LeaderboardController` | `backend/.../community/` | ✅ 可用 | 基于 ChipReport 聚合排行，支持 overall/compute/inference/efficiency/compatibility |
| `CommunityResource` (Entity) | `backend/.../community/` | ✅ 可用 | 完整 JPA Entity，5 种资源分类 |
| `CommunityResourceController` | `backend/.../community/` | ✅ 可用 | 列表查询 + 下载，有 keyword/category 筛选 |
| `CommunityResourceInitializer` | `backend/.../community/` | ✅ 可用 | 启动时初始化预置资源 |
| `PostController` | `backend/.../community/` | ❌ Stub | 返回空 List/硬编码 UUID，无持久化 |
| `DemandController` | `backend/.../community/` | ❌ Stub | 同上 |
| `Community.js` | `frontend/src/pages/` | ⚠️ 半成品 | 文章列表+发布+点赞 UI，调 `/community/articles` API（后端无此端点） |
| `Forum.js` | `frontend/src/pages/` | ⚠️ 半成品 | 论坛页面（~2.6KB），UI 骨架 |
| `CommunityResources.js` | `frontend/src/pages/` | ⚠️ 半成品 | 资源下载页面（~8.6KB），与后端 Controller 对接 |

### 2.2 数据库现状

| 表 | 状态 | 说明 |
|----|------|------|
| `articles` | ✅ 已建 | 含 title/content/summary/category/status/view_count/like_count/comment_count/is_pinned/author_id |
| `community_resources` | ✅ 已建 | 含 name/description/category(CHECK约束)/file_name/file_path/file_size/download_count |
| `comments` | ❌ 缺失 | 前端有评论 UI 但无对应表 |
| `likes/favorites` | ❌ 缺失 | 前端有点赞/收藏 UI 但无对应表 |
| `demands` | ❌ 缺失 | PostController 的 demands 路由无表 |
| `user_points` | ❌ 缺失 | 积分体系所需 |

### 2.3 Gap 摘要

| PRD 要求 | 现状 | Gap |
|----------|------|-----|
| 3.1 内容发布与管理 | articles 表+前端 UI 骨架，后端 Controller 缺失 | **需补 ArticleController + Service** |
| 3.1 审核机制 | 完全缺失 | **需新增 content_reviews 表 + 审核流程** |
| 3.1 内容检索 | 无全文搜索 | **需 PostgreSQL FTS 或 ElasticSearch** |
| 3.2 问答互动 | 完全缺失 | **需新增 questions/answers 表 + 采纳/复盘流程** |
| 3.2 点赞/收藏/评论 | 前端有 UI，无后端 | **需新增 3 张表 + API** |
| 3.3 需求对接 | DemandController 是 stub | **需补 demands 表 + 完整 CRUD** |
| 3.4 积分与等级 | 完全缺失 | **需 user_points + point_transactions + level_rules** |
| 3.4 社区管理 | 完全缺失 | **需内容举报 + 管理员审核工具** |

---

## 3. 数据模型设计

### 3.1 ER 关系总览

```
users ─┬── articles (1:N)
       ├── questions (1:N)
       ├── answers (1:N)
       ├── comments (1:N, polymorphic: article/question/answer/resource)
       ├── likes (1:N, polymorphic)
       ├── favorites (1:N, polymorphic)
       ├── demands (1:N)
       ├── user_points (1:1)
       └── point_transactions (1:N)

articles ──── content_reviews (1:N, 审核记录)
questions ─── answers (1:N)
community_resources (已有，不变)
```

### 3.2 新增/修改表

#### 3.2.1 articles（修改现有）

现有表已基本满足，补充字段：

```sql
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags varchar(500);           -- 标签，逗号分隔
ALTER TABLE articles ADD COLUMN IF NOT EXISTS attachment_urls text;         -- 附件 URL 列表（JSON）
ALTER TABLE articles ADD COLUMN IF NOT EXISTS review_status varchar(20)     -- 审核状态
    DEFAULT 'PENDING' CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE articles ADD COLUMN IF NOT EXISTS favorite_count integer DEFAULT 0;
```

#### 3.2.2 comments（新增）

```sql
CREATE TABLE comments (
    id BIGSERIAL PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,          -- ARTICLE / QUESTION / ANSWER / RESOURCE
    target_id BIGINT NOT NULL,
    parent_id BIGINT REFERENCES comments(id),  -- 支持嵌套回复
    content TEXT NOT NULL,
    author_id BIGINT NOT NULL REFERENCES users(id),
    author_name VARCHAR(50),
    like_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'VISIBLE'
        CHECK (status IN ('VISIBLE', 'HIDDEN', 'DELETED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_target_type CHECK (target_type IN ('ARTICLE', 'QUESTION', 'ANSWER', 'RESOURCE'))
);
CREATE INDEX idx_comments_target ON comments(target_type, target_id);
CREATE INDEX idx_comments_author ON comments(author_id);
```

#### 3.2.3 likes（新增）

```sql
CREATE TABLE likes (
    id BIGSERIAL PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,
    target_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_like UNIQUE(target_type, target_id, user_id),
    CONSTRAINT valid_like_target CHECK (target_type IN ('ARTICLE', 'QUESTION', 'ANSWER', 'COMMENT', 'RESOURCE'))
);
```

#### 3.2.4 favorites（新增）

```sql
CREATE TABLE favorites (
    id BIGSERIAL PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,
    target_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_favorite UNIQUE(target_type, target_id, user_id),
    CONSTRAINT valid_fav_target CHECK (target_type IN ('ARTICLE', 'QUESTION', 'RESOURCE'))
);
```

#### 3.2.5 questions（新增 — Phase 2）

```sql
CREATE TABLE questions (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    tags VARCHAR(500),
    author_id BIGINT NOT NULL REFERENCES users(id),
    author_name VARCHAR(50),
    status VARCHAR(20) DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'ANSWERED', 'CLOSED')),
    accepted_answer_id BIGINT,
    view_count INTEGER DEFAULT 0,
    answer_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_questions_author ON questions(author_id);
CREATE INDEX idx_questions_status ON questions(status);
```

#### 3.2.6 answers（新增 — Phase 2）

```sql
CREATE TABLE answers (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES questions(id),
    content TEXT NOT NULL,
    author_id BIGINT NOT NULL REFERENCES users(id),
    author_name VARCHAR(50),
    is_accepted BOOLEAN DEFAULT FALSE,
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_answers_question ON answers(question_id);
```

#### 3.2.7 demands（新增 — Phase 2）

```sql
CREATE TABLE demands (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(32) NOT NULL
        CHECK (category IN ('EVAL_REQUEST', 'HARDWARE_ADAPT', 'SOFTWARE_COMPAT', 'CONSULTING', 'OTHER')),
    status VARCHAR(20) DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'MATCHED', 'CLOSED')),
    author_id BIGINT NOT NULL REFERENCES users(id),
    author_name VARCHAR(50),
    contact_info VARCHAR(200),
    response_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.2.8 content_reviews（新增 — Phase 2）

```sql
CREATE TABLE content_reviews (
    id BIGSERIAL PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,
    target_id BIGINT NOT NULL,
    reviewer_id BIGINT REFERENCES users(id),
    review_type VARCHAR(20) NOT NULL
        CHECK (review_type IN ('AUTO', 'MANUAL')),
    decision VARCHAR(20) NOT NULL
        CHECK (decision IN ('APPROVED', 'REJECTED', 'PENDING')),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.2.9 积分体系（Phase 3）

```sql
CREATE TABLE user_points (
    user_id BIGINT PRIMARY KEY REFERENCES users(id),
    total_points INTEGER DEFAULT 0,
    level VARCHAR(20) DEFAULT 'BEGINNER'
        CHECK (level IN ('BEGINNER', 'INTERMEDIATE', 'EXPERT', 'SENIOR_EXPERT')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE point_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    points INTEGER NOT NULL,          -- 正数加、负数减
    action VARCHAR(50) NOT NULL,       -- PUBLISH_ARTICLE / ANSWER_ACCEPTED / DOWNLOAD_RESOURCE / etc.
    reference_type VARCHAR(20),
    reference_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_point_tx_user ON point_transactions(user_id);
```

**等级规则：**
| 等级 | 积分范围 | 对应 PRD |
|------|----------|----------|
| 新手 (BEGINNER) | 0-99 | 新手 |
| 进阶 (INTERMEDIATE) | 100-499 | 进阶 |
| 专家 (EXPERT) | 500-1999 | 专家 |
| 资深专家 (SENIOR_EXPERT) | 2000+ | 资深专家 |

**积分规则：**
| 行为 | 积分 | 说明 |
|------|------|------|
| 发布文章（通过审核）| +10 | |
| 文章被点赞 | +2 | |
| 回答问题 | +5 | |
| 回答被采纳 | +15 | |
| 发布需求 | +3 | |
| 下载资源 | +1 | 每日上限 5 |
| 每日签到 | +1 | |
| 违规处罚 | -20~-100 | 按严重程度 |

---

## 4. API 设计

### 4.1 Phase 1 — 内容发布 + 资源下载 + 基础互动

#### 文章 API（替换现有 stub PostController → ArticleController）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/community/articles` | 文章列表（分页+筛选+搜索） |
| POST | `/api/v1/community/articles` | 发布文章 |
| GET | `/api/v1/community/articles/{id}` | 文章详情（同时 +1 view_count） |
| PUT | `/api/v1/community/articles/{id}` | 编辑文章（仅作者） |
| DELETE | `/api/v1/community/articles/{id}` | 删除文章（作者或管理员） |
| GET | `/api/v1/community/stats` | 社区统计数据 |

#### 互动 API

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/community/likes` | 点赞 `{targetType, targetId}` |
| DELETE | `/api/v1/community/likes` | 取消点赞 |
| POST | `/api/v1/community/favorites` | 收藏 |
| DELETE | `/api/v1/community/favorites` | 取消收藏 |
| GET | `/api/v1/community/favorites` | 我的收藏列表 |
| GET | `/api/v1/community/comments?targetType=X&targetId=Y` | 评论列表 |
| POST | `/api/v1/community/comments` | 发表评论 |
| DELETE | `/api/v1/community/comments/{id}` | 删除评论 |

#### 资源 API（已有，保持不变）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/community/resources` | 资源列表 |
| GET | `/api/v1/community/resources/{id}/download` | 下载资源 |

#### 榜单 API（已有，保持不变）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/community/leaderboard?type=X` | 评测排行榜 |

### 4.2 Phase 2 — 问答 + 需求 + 审核

#### 问答 API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/community/questions` | 问题列表 |
| POST | `/api/v1/community/questions` | 提问 |
| GET | `/api/v1/community/questions/{id}` | 问题详情 + 回答列表 |
| POST | `/api/v1/community/questions/{id}/answers` | 回答问题 |
| PUT | `/api/v1/community/questions/{id}/accept/{answerId}` | 采纳回答（仅提问者） |

#### 需求 API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/community/demands` | 需求列表 |
| POST | `/api/v1/community/demands` | 发布需求 |
| GET | `/api/v1/community/demands/{id}` | 需求详情 |
| PUT | `/api/v1/community/demands/{id}/status` | 更新需求状态 |

#### 审核 API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/admin/reviews?status=PENDING` | 待审核内容列表 |
| POST | `/api/v1/admin/reviews/{id}/approve` | 通过审核 |
| POST | `/api/v1/admin/reviews/{id}/reject` | 驳回审核 |

### 4.3 Phase 3 — 积分 + 推荐

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/community/points/me` | 我的积分 + 等级 |
| GET | `/api/v1/community/points/transactions` | 积分明细 |
| GET | `/api/v1/community/points/leaderboard` | 积分排行榜 |
| GET | `/api/v1/community/recommendations` | 个性化推荐内容 |

---

## 5. 前端页面设计

### 5.1 页面结构

```
/community                    → 社区首页（文章列表 + 统计 + 搜索 + 筛选）  [已有骨架]
/community/articles/{id}      → 文章详情（正文 + 评论 + 点赞/收藏）
/community/resources          → 资源下载（列表 + 搜索 + 分类筛选）        [已有骨架]
/community/leaderboard        → 评测排行榜                                [已有]
/community/forum              → 问答论坛（问题列表）                      [Phase 2]
/community/forum/{id}         → 问题详情 + 回答                           [Phase 2]
/community/demands            → 需求广场                                  [Phase 2]
/community/demands/{id}       → 需求详情                                  [Phase 2]
/community/my                 → 个人中心（我的文章/收藏/积分）             [Phase 3]
```

### 5.2 Phase 1 改造要点

1. **Community.js 改造** — 当前调 `/community/articles` API（后端无此端点），需：
   - 后端新增 `ArticleController`（替换 PostController stub）
   - 对接 articles 表（已有）
   - 添加评论区组件（复用 CommentList 组件）
   - 点赞/收藏按钮对接 likes/favorites API

2. **CommunityResources.js** — 基本可用，需：
   - 添加资源评分/评论功能
   - 下载计数器优化（防重复计数）

3. **新增 ArticleDetail 页面** — 文章正文渲染 + Markdown 支持 + 代码高亮 + 评论区

### 5.3 组件复用规划

| 组件 | 适用页面 | 说明 |
|------|----------|------|
| `CommentList` | 文章详情、问题详情、资源详情 | 通用评论组件，polymorphic targetType |
| `LikeButton` | 文章、问题、回答、评论 | 通用点赞组件 |
| `FavoriteButton` | 文章、问题、资源 | 通用收藏组件 |
| `TagSelect` | 文章发布、问题发布 | 标签选择器 |
| `ContentEditor` | 文章发布、问题发布、回答 | 富文本编辑器（Markdown + 附件上传） |

---

## 6. 审核机制设计（Phase 2）

### 6.1 审核流程

```
用户发布内容
    ↓
[自动审核] ← 关键词过滤 + 重复检测
    ↓ (通过)          ↓ (命中)
[直接发布]      [进入人工审核队列]
                    ↓
              管理员审核
            ↓ (通过)    ↓ (驳回)
        [发布+通知]  [通知作者修改]
```

### 6.2 自动审核规则

1. **关键词过滤** — 敏感词库匹配（可后台配置）
2. **重复检测** — 标题/内容相似度 > 80% 则标记
3. **频率限制** — 同一用户 1 小时内发布 > 5 条则自动进人工队列
4. **首次发布** — 新用户首 3 篇文章强制人工审核

### 6.3 SLA

PRD 要求：**审核时间 ≤ 24 小时**。自动审核通过的即时发布；进入人工队列的需管理员在 24h 内处理。

---

## 7. 技术选型

### 7.1 内容搜索

**方案选择：PostgreSQL Full Text Search (FTS)**

理由：
- 数据量预期 Phase 1 内容 < 1 万条，FTS 完全够用
- 无需额外部署 ElasticSearch（降低运维复杂度）
- 与现有技术栈一致

实现：
```sql
ALTER TABLE articles ADD COLUMN search_vector tsvector;
CREATE INDEX idx_articles_search ON articles USING gin(search_vector);
-- Trigger 自动更新 search_vector
```

**Phase 3 升级路径**：如内容量 > 10 万条，评估迁移到 ElasticSearch。

### 7.2 富文本编辑器

**推荐：react-md-editor**（Markdown 编辑器）

理由：
- PRD 要求支持"图文+附件+代码+LaTeX"
- Markdown 天然支持代码块
- LaTeX 可通过 KaTeX 插件支持
- 附件走 MinIO 上传（已有基础设施）
- 轻量级，与 Ant Design 兼容

### 7.3 个性化推荐（Phase 3）

**方案：基于标签的协同过滤**

1. 用户行为记录（浏览、点赞、收藏的内容标签）
2. 按标签权重计算用户兴趣向量
3. 推荐同标签高热度内容

Phase 3 后期可引入更复杂的推荐算法。初期简单有效即可。

---

## 8. 工作量估算

### Phase 1（MVP）— 约 15 工作日

| 任务 | 工作日 | 说明 |
|------|--------|------|
| ArticleController + ArticleService | 3 | 替换 PostController stub，CRUD + 分页搜索 |
| comments/likes/favorites 三表 + API | 3 | 通用 polymorphic 设计 |
| 前端 Community.js 改造 | 2 | 对接真实 API + 评论区 |
| 文章详情页 | 2 | Markdown 渲染 + 评论 + 点赞收藏 |
| 富文本编辑器集成 | 2 | react-md-editor + MinIO 附件上传 |
| PostgreSQL FTS 集成 | 1 | search_vector + 搜索 API |
| E2E 测试 | 2 | 社区模块 Playwright 测试 |

### Phase 2 — 约 18 工作日

| 任务 | 工作日 | 说明 |
|------|--------|------|
| 问答系统 (questions/answers) | 5 | 提问→回答→采纳流程 |
| 需求对接 (demands) | 3 | 替换 DemandController stub |
| 审核系统 | 5 | 自动审核 + 人工审核队列 + 管理界面 |
| 前端问答/需求页面 | 3 | Forum.js 改造 + 需求广场 |
| E2E 测试 | 2 | |

### Phase 3 — 约 12 工作日

| 任务 | 工作日 | 说明 |
|------|--------|------|
| 积分系统 | 4 | user_points + 积分规则引擎 + 等级升降 |
| 个性化推荐 | 3 | 标签协同过滤 + 推荐 API |
| 社区管理后台 | 3 | 举报处理 + 内容管理 + 用户管理 |
| 个人中心 | 2 | 我的文章/收藏/积分面板 |

**总计：~45 工作日（约 2.5 个月）**，在 2027.06 deadline 内有充足余量。

---

## 9. 风险与决策点

### 9.1 需 chenxi 确认的决策

1. **Phase 1 开始时间** — 建议在评测系统 Phase 1（2026.09 内部上线）稳定后启动。还是有更早/更晚的需求？

2. **富文本 vs Markdown** — PRD 提到"图文+附件+代码+LaTeX"，推荐 Markdown（开发成本低、符合技术社区习惯）。还是需要 WYSIWYG 富文本编辑器（如 TinyMCE/Quill）？

3. **审核严格度** — PRD 要求"自动+人工，≤24小时"。初期（内部使用阶段）是否可以简化为"仅管理员可发布"，后续再开放普通用户发布+审核流程？

4. **个性化推荐算法** — Phase 3 计划用标签协同过滤。是否有更具体的推荐逻辑需求（如基于用户画像、基于行业/领域等）？

5. **社区是否需要独立域名/入口** — PRD 说"唯一生态流量入口"。当前社区是平台内的一个模块（/community），是否需要独立为单独的前端应用或子域名？

### 9.2 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 内容审核误判 | 中 | 中 | 初期人工审核为主，积累数据后优化自动审核 |
| 积分刷分 | 中 | 低 | 每日积分上限 + 行为频率限制 |
| 内容搜索性能 | 低 | 中 | PostgreSQL FTS 初期足够，备选 ES |
| 评论区垃圾内容 | 中 | 中 | 嵌套评论限制层数（max 3），频率限制 |

---

## 10. 与其他模块的依赖

| 依赖模块 | 依赖点 | 说明 |
|----------|--------|------|
| 用户体系（模块4）| users 表 + 认证 | 社区所有操作需要已认证用户 |
| 评测结果（模块2）| ChipReport | 排行榜数据来源（已实现） |
| 资源纳管（模块5）| MinIO 存储 | 附件/资源文件存储（已有基础设施） |

社区模块与评测系统核心（模块1）无直接代码依赖，可并行开发。

---

## Appendix A: 前端现有 API 调用梳理

Community.js 当前调用的 API（需后端匹配实现）：

```
GET  /community/articles         → 文章列表（params: keyword, category, size）
POST /community/articles         → 发布文章
GET  /community/articles/{id}    → 文章详情
POST /community/articles/{id}/like → 点赞
GET  /community/stats            → 社区统计
```

Forum.js 当前调用的 API：
```
GET  /community/posts            → 帖子列表（PostController stub）
POST /community/posts            → 发帖
GET  /community/posts/{id}       → 帖子详情
```

**建议：统一到 `/community/articles` 路由**，Forum.js 合并到 Community.js 或复用 ArticleController（分 category 区分文章/讨论/问答）。
