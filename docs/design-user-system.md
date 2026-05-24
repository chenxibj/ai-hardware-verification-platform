# 用户体系与权限模块设计文档（PRD 模块4）

> **版本**: v1.0  
> **日期**: 2026-05-24  
> **作者**: 菜菜子 (AI PM)  
> **状态**: Draft — 待 chenxi review  
> **关联**: PRD §模块4（用户体系）、现有 auth/user 代码

---

## 1. 目标与范围

### 1.1 要解决什么问题

PRD 将用户体系定位为 **"平台所有功能模块的基础支撑"**，需提供用户注册/登录、角色权限管理、多租户隔离、用户画像等能力。

当前状态：
- ✅ **已有基础**：User Entity（含 email/password/role/status/tenantId）、AuthController（注册/登录/refresh/me）、JwtTokenProvider、BCrypt 密码加密
- ✅ **已有 RBAC 雏形**：Role 枚举（5 级层级权限）、@RequireRole 注解 + RoleInterceptor 拦截器
- ✅ **已有管理接口**：UserController（CRUD + 角色/状态管理，PreAuthorize 保护）
- ⚠️ **不完善**：角色体系与 PRD 需求不完全匹配（缺少 reviewer/contributor）
- ❌ **缺失**：OAuth 第三方登录、邮箱验证流程、密码重置、操作审计日志、细粒度资源级权限、API Rate Limiting、用户 Profile 丰富化

### 1.2 目标

用户体系是所有业务模块的前置依赖，需尽早稳定。规划分阶段交付：

| 阶段 | 时间 | 范围 | 优先级 |
|------|------|------|--------|
| Phase 1 (已完成) | 2026.04-05 | 邮箱注册/登录 + JWT + 基础 RBAC | P0 |
| Phase 2 (当前) | 2026.06-07 | 角色体系完善 + 资源级权限 + Profile + 安全加固 | P0 |
| Phase 3 | 2026.08-09 | OAuth 扩展 + 多租户完善 + 审计日志 | P1 |

### 1.3 不包含

- 积分体系（属于社区模块 Phase 3，见 design-community.md）
- 计费/订阅系统（独立模块）
- 异构资源纳管的资源权限（模块5，独立设计文档）

---

## 2. 现状分析

### 2.1 已有代码盘点

| 组件 | 路径 | 状态 | 说明 |
|------|------|------|------|
| `User` (Entity) | `backend/.../user/User.java` | ✅ 可用 | JPA Entity，含 email/username/password/role/status/tenantId/org/avatar |
| `UserService` | `backend/.../user/UserService.java` | ✅ 可用 | 注册（含密码强度校验）、认证、CRUD、initAdminUser |
| `UserRepository` | `backend/.../user/UserRepository.java` | ✅ 可用 | JPA Repository |
| `UserController` | `backend/.../user/UserController.java` | ✅ 可用 | 管理员 CRUD 接口，@PreAuthorize 保护 |
| `AuthController` | `backend/.../auth/AuthController.java` | ✅ 可用 | /register, /login, /refresh, /me, /profile, /logout |
| `Role` (Enum) | `backend/.../auth/Role.java` | ✅ 可用 | 5 级层级：SUPER_ADMIN > TENANT_ADMIN > ENGINEER > PRODUCT_MGR > VIEWER |
| `RequireRole` | `backend/.../auth/RequireRole.java` | ✅ 可用 | 方法/类级注解 |
| `RoleInterceptor` | `backend/.../auth/RoleInterceptor.java` | ✅ 可用 | 基于层级的角色检查 |
| `JwtTokenProvider` | `backend/.../config/JwtTokenProvider.java` | ✅ 可用 | HS256 签名，含 userId/email/role/tenantId |
| `SecurityConfig` | `backend/.../config/SecurityConfig.java` | ✅ 可用 | Spring Security 配置，Stateless + JWT Filter |
| `JwtAuthenticationFilter` | `backend/.../config/` | ✅ 可用 | 从 Header 提取 JWT 并设置 SecurityContext |
| `AgentTokenFilter` | `backend/.../config/` | ✅ 可用 | 内部 Agent Token 认证（无需用户登录） |

### 2.2 数据库现状

| 表 | 状态 | 说明 |
|----|------|------|
| `users` | ✅ 已建 | 含 id/username/email/phone/password/user_type/role/org/avatar_url/avatar/status/email_verified/phone_verified/tenant_id/last_login_at/created_at/updated_at |
| `roles` | ❌ 缺失 | 当前角色硬编码在 User.role 字段（字符串），无独立角色表 |
| `permissions` | ❌ 缺失 | 无资源级权限表 |
| `user_sessions` | ❌ 缺失 | JWT 无状态，无 session 追踪（不支持强制下线） |
| `audit_logs` | ❌ 缺失 | 无操作审计日志 |

### 2.3 Gap 摘要

| PRD 要求 | 现状 | Gap |
|----------|------|-----|
| 用户注册/登录 | ✅ 已实现（邮箱+密码） | 缺邮箱验证流程、密码重置 |
| 角色体系 | ⚠️ 部分实现（5 级层级） | 需增加 reviewer/contributor 角色以适配社区场景 |
| RBAC 权限 | ⚠️ 仅层级检查 | 需资源级权限（谁能操作哪个评测任务/文章） |
| 用户 Profile | ⚠️ 基础字段 | 缺 bio/skills/interests/社交链接 |
| 多租户隔离 | ⚠️ 有 tenantId 字段 | 缺租户管理 CRUD、数据隔离拦截 |
| OAuth 登录 | ❌ 完全缺失 | 需 GitHub/微信/企业微信 OAuth |
| Rate Limiting | ❌ 完全缺失 | 需 API 级别限流 |
| 审计日志 | ❌ 完全缺失 | 需记录关键操作 |

---

## 3. 角色体系设计

### 3.1 角色定义

在现有 5 级层级基础上，**扩展为 7 个角色**，分为「平台管理」和「社区参与」两类：

| 角色 | 英文标识 | 层级 | 定位 | 典型用户 |
|------|----------|------|------|----------|
| 超级管理员 | `super_admin` | 0 | 平台全权管理 | 运维团队 |
| 租户管理员 | `tenant_admin` | 1 | 租户内管理 | 企业管理者 |
| 评测工程师 | `engineer` | 2 | 创建/执行评测任务 | 技术人员 |
| 审核员 | `reviewer` | 2 | 审核社区内容/评测报告 | 特邀专家 |
| 产品经理 | `product_mgr` | 3 | 查看报告/需求管理 | PM |
| 贡献者 | `contributor` | 4 | 社区内容发布 | 注册用户（活跃） |
| 观察者 | `viewer` | 5 | 只读浏览 | 未认证/新注册用户 |

### 3.2 角色权限矩阵

| 资源/操作 | super_admin | tenant_admin | engineer | reviewer | product_mgr | contributor | viewer |
|-----------|:-----------:|:------------:|:--------:|:--------:|:-----------:|:-----------:|:------:|
| 用户管理 CRUD | ✅ | ✅(租户内) | ❌ | ❌ | ❌ | ❌ | ❌ |
| 角色分配 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 评测任务-创建 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 评测任务-查看 | ✅ | ✅(租户内) | ✅(自己的) | ✅ | ✅ | ❌ | ❌ |
| 评测报告-生成 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 评测报告-审核 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 社区-发布文章 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 社区-审核内容 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 社区-浏览内容 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 资源-下载 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 资源-上传 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 系统配置 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 审计日志查看 | ✅ | ✅(租户内) | ❌ | ❌ | ❌ | ❌ | ❌ |

### 3.3 角色升降规则

- **新注册用户**默认角色：`contributor`（可发布内容）
- 管理员可手动调整角色
- 未来可结合积分体系自动升级（Phase 3）
- 违规用户可被降级为 `viewer`（只读）或 `LOCKED` 状态

### 3.4 向后兼容

现有代码使用字符串存储角色（`User.role` 字段），且 Role 枚举已支持 `fromString()` 兼容旧数据。扩展时：
- 在 Role 枚举中添加 `REVIEWER(2)` 和 `CONTRIBUTOR(4)`
- REVIEWER 与 ENGINEER 同级（level=2），通过权限矩阵区分可操作资源
- CONTRIBUTOR 独立层级（level=4），低于 PRODUCT_MGR

---

## 4. 权限模型设计（RBAC + 资源级权限）

### 4.1 双层权限架构

```
┌──────────────────────────────────────────────┐
│  Layer 1: 角色层级检查（已有）                   │
│  @RequireRole(Role.ENGINEER)                  │
│  → 判断用户角色层级 ≤ 所需层级                   │
└──────────────────────┬───────────────────────┘
                       │ 通过
                       ▼
┌──────────────────────────────────────────────┐
│  Layer 2: 资源级权限检查（新增）                  │
│  @RequirePermission("task:view:own")          │
│  → 判断用户对具体资源实例是否有操作权限            │
└──────────────────────────────────────────────┘
```

### 4.2 权限标识规范

采用 `resource:action:scope` 三段式：

```
task:create:any        — 创建任何评测任务
task:view:own          — 查看自己的评测任务
task:view:tenant       — 查看租户内所有任务
article:publish:own    — 发布自己的文章
article:review:any     — 审核任何文章
user:manage:tenant     — 管理租户内用户
system:config:any      — 修改系统配置
```

### 4.3 权限检查策略

| 场景 | 检查方式 | 说明 |
|------|----------|------|
| 公开 API（社区浏览、排行榜） | 无需认证 | SecurityConfig permitAll |
| 已认证即可（个人 profile） | JWT 有效 | Spring Security authenticated |
| 角色层级（管理员操作） | @RequireRole | 现有 RoleInterceptor |
| 资源归属（编辑自己的文章） | Service 层检查 | `article.authorId == currentUser.id` |
| 租户隔离（查看租户数据） | 拦截器自动注入 | TenantFilter 自动加 WHERE tenant_id = ? |

### 4.4 实现方案

Phase 2 **不引入独立 permissions 表**（避免过度设计），而是：
1. 角色与权限的映射硬编码在配置中（`RolePermissionConfig`）
2. 资源归属检查在 Service 层完成
3. 租户隔离通过 Hibernate Filter 或 Repository 方法参数实现

Phase 3 若需动态权限配置（如自定义角色），再引入 `role_permissions` 表。

---

## 5. 用户注册与登录

### 5.1 注册流程（现有 + 增强）

```
用户填写表单
    ↓
[前端校验] email 格式 + 密码强度 + 用户名长度
    ↓
POST /auth/register
    ↓
[后端校验] 邮箱唯一 + 用户名唯一 + 密码规则(8-32位,大小写+数字)
    ↓
[创建用户] BCrypt 加密密码, 默认角色 contributor, 状态 ACTIVE
    ↓
[生成 Token] JWT access_token(24h) + refresh_token(7d)
    ↓
[返回] token + user info
    ↓ (Phase 2 新增)
[发送验证邮件] 验证链接 + 6位验证码, 24h 有效
```

### 5.2 登录流程（现有）

```
POST /auth/login {email, password}
    ↓
[查找用户] findByEmail → 404 则返回"邮箱或密码错误"
    ↓
[状态检查] LOCKED → 返回"账号已锁定"
    ↓
[密码验证] BCrypt matches
    ↓
[更新] lastLoginAt
    ↓
[生成 Token] JWT access_token + refresh_token
    ↓
[返回] {token, refreshToken, expiresIn: 86400, user: {...}}
```

### 5.3 密码重置（Phase 2 新增）

```
POST /auth/forgot-password {email}
    ↓
[查找用户] 存在则发送重置邮件（6位验证码，15分钟有效）
    ↓ (不论是否存在都返回成功，防止邮箱探测)
POST /auth/reset-password {email, code, newPassword}
    ↓
[验证码校验] → BCrypt 更新密码 → 使旧 Token 失效
```

### 5.4 OAuth 登录（Phase 3 扩展）

| 提供商 | 场景 | 实现方案 |
|--------|------|----------|
| GitHub | 开发者社区用户 | Spring Security OAuth2 Client |
| 微信 | 国内 C 端用户 | 自定义 OAuth2 Provider |
| 企业微信 | B 端企业用户 | 自定义 OAuth2 Provider |

OAuth 登录后自动关联或创建本地账户，策略：
- 邮箱匹配已有账户 → 绑定
- 无匹配 → 创建新账户（角色 contributor）
- 用户可在 Profile 页管理已绑定的第三方账号

---

## 6. 会话管理（JWT）

### 6.1 现有方案（保持不变）

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 签名算法 | HS256 | HMAC-SHA256 |
| Secret | `${jwt.secret}` | 配置文件注入，≥32 字节 |
| Access Token 有效期 | 24 小时 | `jwt.expiration=86400000` |
| Refresh Token 有效期 | 7 天 | `expiration * 7` |
| Token 位置 | `Authorization: Bearer <token>` | Header 传递 |
| Claims | sub(userId), email, role, tenantId, iat, exp | |

### 6.2 Token 刷新流程

```
客户端检测到 401 (Token 过期)
    ↓
POST /auth/refresh {refreshToken}
    ↓
[验证 refreshToken] 有效 → 签发新 access_token + 新 refresh_token（旋转刷新）
    ↓
[返回] {token, refreshToken, expiresIn}
```

**旋转刷新**（Refresh Token Rotation）：每次刷新后旧 refreshToken 作废，防止 token 泄露后被重放。

### 6.3 Phase 2 增强：Token 黑名单

场景：管理员强制下线用户、用户修改密码后使旧 token 失效。

方案：Redis SET 存储已失效的 token JTI（JWT ID），Filter 中检查：

```java
// JwtAuthenticationFilter 增加检查
if (redisTemplate.hasKey("jwt:blacklist:" + jti)) {
    throw new AuthenticationException("Token has been revoked");
}
```

黑名单条目 TTL = token 剩余有效时间（避免无限增长）。

---

## 7. 用户 Profile 管理

### 7.1 Profile 字段扩展

在现有 User Entity 基础上，新增 `user_profiles` 表（1:1 关系）：

```sql
CREATE TABLE user_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id),
    bio TEXT,                              -- 个人简介（≤500字）
    title VARCHAR(100),                    -- 职位/头衔
    company VARCHAR(100),                  -- 所在公司/机构
    location VARCHAR(100),                 -- 所在地
    website VARCHAR(255),                  -- 个人网站
    github VARCHAR(100),                   -- GitHub 用户名
    skills VARCHAR(500),                   -- 技能标签（逗号分隔）
    interests VARCHAR(500),               -- 兴趣领域
    visibility VARCHAR(20) DEFAULT 'PUBLIC'
        CHECK (visibility IN ('PUBLIC', 'MEMBERS_ONLY', 'PRIVATE')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7.2 Profile API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/users/me/profile` | 获取当前用户 Profile |
| PUT | `/api/v1/users/me/profile` | 更新 Profile |
| POST | `/api/v1/users/me/avatar` | 上传头像（MinIO） |
| GET | `/api/v1/users/{id}/profile` | 查看他人 Profile（受 visibility 控制） |
| PUT | `/api/v1/users/me/password` | 修改密码 |
| GET | `/api/v1/users/me/activity` | 我的活动记录（文章/评测/评论） |

---

## 8. API 设计

### 8.1 认证 API（现有，保持不变）

| Method | Path | 说明 | 认证要求 |
|--------|------|------|----------|
| POST | `/auth/register` | 用户注册 | 无 |
| POST | `/auth/login` | 用户登录 | 无 |
| POST | `/auth/refresh` | 刷新 Token | refreshToken |
| GET | `/auth/me` | 当前用户信息 | Bearer Token |
| GET | `/auth/profile` | 当前用户详情 | Bearer Token |
| POST | `/auth/logout` | 退出登录 | Bearer Token |

### 8.2 认证 API（Phase 2 新增）

| Method | Path | 说明 | 认证要求 |
|--------|------|------|----------|
| POST | `/auth/forgot-password` | 发送密码重置邮件 | 无 |
| POST | `/auth/reset-password` | 重置密码 | 验证码 |
| POST | `/auth/verify-email` | 邮箱验证 | 验证码 |
| POST | `/auth/resend-verification` | 重新发送验证邮件 | Bearer Token |

### 8.3 用户管理 API（现有 + 增强）

| Method | Path | 说明 | 权限要求 |
|--------|------|------|----------|
| GET | `/users` | 用户列表（分页） | super_admin / tenant_admin |
| POST | `/users` | 创建用户 | super_admin |
| GET | `/users/{id}` | 用户详情 | super_admin / tenant_admin |
| PUT | `/users/{id}/role` | 修改角色 | super_admin |
| PUT | `/users/{id}/status` | 修改状态（锁定/解锁） | super_admin |
| GET | `/users/stats` | 用户统计 | super_admin / tenant_admin |
| DELETE | `/users/{id}` | 删除用户（软删除） | super_admin |

### 8.4 Profile API（Phase 2 新增）

| Method | Path | 说明 | 权限要求 |
|--------|------|------|----------|
| GET | `/api/v1/users/me/profile` | 我的 Profile | authenticated |
| PUT | `/api/v1/users/me/profile` | 更新 Profile | authenticated |
| POST | `/api/v1/users/me/avatar` | 上传头像 | authenticated |
| PUT | `/api/v1/users/me/password` | 修改密码 | authenticated |
| GET | `/api/v1/users/{id}/profile` | 查看他人 Profile | authenticated (受 visibility 限制) |

### 8.5 审计 API（Phase 3）

| Method | Path | 说明 | 权限要求 |
|--------|------|------|----------|
| GET | `/api/v1/audit-logs` | 审计日志列表 | super_admin / tenant_admin |
| GET | `/api/v1/audit-logs/export` | 导出审计日志 | super_admin |

---

## 9. 数据库 Schema

### 9.1 现有表结构（users）

```sql
-- 已有，无需修改
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(30) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL,
    role VARCHAR(20),
    org VARCHAR(128),
    avatar_url VARCHAR(500),
    avatar VARCHAR(500),
    status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    tenant_id BIGINT,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role);
```

### 9.2 新增表

#### 9.2.1 user_profiles（用户 Profile 扩展）

```sql
CREATE TABLE user_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    title VARCHAR(100),
    company VARCHAR(100),
    location VARCHAR(100),
    website VARCHAR(255),
    github VARCHAR(100),
    skills VARCHAR(500),
    interests VARCHAR(500),
    visibility VARCHAR(20) DEFAULT 'PUBLIC'
        CHECK (visibility IN ('PUBLIC', 'MEMBERS_ONLY', 'PRIVATE')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 9.2.2 verification_codes（验证码）

```sql
CREATE TABLE verification_codes (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    type VARCHAR(20) NOT NULL
        CHECK (type IN ('EMAIL_VERIFY', 'PASSWORD_RESET')),
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_verification_email_type ON verification_codes(email, type);
```

#### 9.2.3 oauth_accounts（第三方账号绑定 — Phase 3）

```sql
CREATE TABLE oauth_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,              -- GITHUB / WECHAT / WECOM
    provider_user_id VARCHAR(255) NOT NULL,     -- 第三方平台用户 ID
    provider_username VARCHAR(100),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_oauth UNIQUE(provider, provider_user_id)
);
CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);
```

#### 9.2.4 audit_logs（审计日志 — Phase 3）

```sql
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    action VARCHAR(50) NOT NULL,               -- LOGIN / REGISTER / UPDATE_ROLE / DELETE_USER / etc.
    resource_type VARCHAR(30),                 -- USER / TASK / ARTICLE / etc.
    resource_id VARCHAR(50),
    details JSONB,                             -- 操作详情（变更前后值）
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    tenant_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
```

#### 9.2.5 tenants（租户管理 — Phase 3）

```sql
CREATE TABLE tenants (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,          -- 租户唯一标识
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    max_users INTEGER DEFAULT 50,
    max_tasks_per_day INTEGER DEFAULT 100,
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED')),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.3 ER 关系总览

```
users ─┬── user_profiles (1:1)
       ├── oauth_accounts (1:N)
       ├── verification_codes (通过 email 关联)
       ├── audit_logs (1:N)
       └── tenants (N:1, 通过 tenant_id)
```

---

## 10. 安全考量

### 10.1 密码安全

| 措施 | 状态 | 说明 |
|------|------|------|
| BCrypt 哈希 | ✅ 已实现 | `PasswordEncoder` Bean，cost factor 默认 10 |
| 密码强度校验 | ✅ 已实现 | 8-32 位，含大小写+数字 |
| 密码历史 | ❌ Phase 3 | 禁止使用最近 5 次密码 |
| 登录失败锁定 | ❌ Phase 2 | 连续 5 次失败 → 锁定 30 分钟 |

### 10.2 API Rate Limiting（Phase 2）

| 端点类型 | 限制 | 说明 |
|----------|------|------|
| `/auth/login` | 5 次/分钟/IP | 防暴力破解 |
| `/auth/register` | 3 次/小时/IP | 防批量注册 |
| `/auth/forgot-password` | 3 次/小时/email | 防邮件轰炸 |
| 普通 API | 100 次/分钟/用户 | 通用限流 |
| 管理 API | 30 次/分钟/用户 | 管理接口限流 |

**实现方案**：Spring Boot + Bucket4j + Redis（令牌桶算法）

```java
@RateLimited(key = "login:{#request.email}", limit = 5, period = 60)
@PostMapping("/auth/login")
public ResponseEntity<?> login(...) { ... }
```

### 10.3 Token 安全

| 措施 | 状态 | 说明 |
|------|------|------|
| HTTPS Only | ✅ 生产环境 | Nginx SSL 终止 |
| Token 有效期 | ✅ 24h + 7d | access + refresh |
| Refresh Token Rotation | ⚠️ Phase 2 | 每次刷新作废旧 token |
| Token 黑名单 | ❌ Phase 2 | Redis 存储已撤销 token |
| JTI (JWT ID) | ❌ Phase 2 | 每个 token 唯一 ID，支持精确撤销 |

### 10.4 数据安全

| 措施 | 状态 | 说明 |
|------|------|------|
| 密码不返回前端 | ✅ 已实现 | userToMap 不含 password |
| SQL 注入防护 | ✅ JPA | Parameterized queries |
| XSS 防护 | ✅ Spring Security | 默认 headers |
| CORS 配置 | ✅ 已实现 | 白名单域名 |
| 敏感操作二次验证 | ❌ Phase 3 | 修改密码/绑定第三方需验证当前密码 |

### 10.5 审计与合规

| 措施 | 阶段 | 说明 |
|------|------|------|
| 登录日志 | Phase 2 | 记录 IP + UA + 时间 |
| 关键操作日志 | Phase 3 | 角色变更、用户删除、系统配置修改 |
| 数据导出 | Phase 3 | 满足等保三级审计要求 |

---

## 11. 多租户设计（Phase 3）

### 11.1 隔离策略

采用 **共享数据库 + 行级隔离** 方案（适合当前规模）：

```
┌────────────────────────────────────────┐
│  所有租户共享同一数据库                    │
│  通过 tenant_id 字段隔离数据             │
│                                        │
│  users.tenant_id = 1  (企业A 的数据)     │
│  users.tenant_id = 2  (企业B 的数据)     │
│  users.tenant_id = NULL (平台级用户)     │
└────────────────────────────────────────┘
```

### 11.2 自动隔离

通过 Hibernate Filter 或自定义 Aspect 自动注入 tenant_id 条件：

```java
@TenantScoped  // 自定义注解
public Page<Task> listTasks(Pageable pageable) {
    // 自动添加 WHERE tenant_id = :currentTenantId
}
```

### 11.3 租户配额

| 配额项 | 默认值 | 说明 |
|--------|--------|------|
| 最大用户数 | 50 | 可按套餐升级 |
| 每日评测任务数 | 100 | 超出需付费 |
| 存储空间 | 10GB | 评测报告 + 附件 |
| API 调用频率 | 1000/小时 | 租户级限流 |

---

## 12. 技术实现要点

### 12.1 代码改动清单（Phase 2）

| 文件 | 改动 | 说明 |
|------|------|------|
| `Role.java` | 新增 REVIEWER(2), CONTRIBUTOR(4) | 角色枚举扩展 |
| `UserService.java` | 默认角色改为 contributor | 新注册用户默认角色 |
| `UserService.java` | 新增 forgotPassword/resetPassword | 密码重置 |
| `AuthController.java` | 新增 forgot-password/reset-password/verify-email 接口 | |
| `UserProfileEntity.java` | 新增 | Profile 扩展实体 |
| `UserProfileController.java` | 新增 | Profile CRUD |
| `VerificationCode.java` | 新增 | 验证码实体 |
| `EmailService.java` | 新增 | 邮件发送（Spring Mail） |
| `RateLimitConfig.java` | 新增 | Bucket4j 限流配置 |
| `LoginAttemptService.java` | 新增 | 登录失败计数 + 锁定 |

### 12.2 依赖引入

```xml
<!-- Phase 2 新增依赖 -->
<dependency>
    <groupId>com.bucket4j</groupId>
    <artifactId>bucket4j-core</artifactId>
    <version>8.7.0</version>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-mail</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

### 12.3 配置项

```yaml
# application.yml 新增
spring:
  mail:
    host: smtp.example.com
    port: 465
    username: noreply@ahvp.com
    password: ${MAIL_PASSWORD}
    properties:
      mail.smtp.ssl.enable: true

rate-limit:
  login:
    limit: 5
    period-seconds: 60
  register:
    limit: 3
    period-seconds: 3600

user:
  default-role: contributor
  password:
    min-length: 8
    max-length: 32
    require-uppercase: true
    require-lowercase: true
    require-digit: true
```

---

## 13. 工作量估算

### Phase 2（当前）— 约 10 工作日

| 任务 | 工作日 | 说明 |
|------|--------|------|
| Role 枚举扩展 + 权限矩阵配置 | 1 | 新增 REVIEWER/CONTRIBUTOR，调整 level |
| 用户 Profile 表 + API | 2 | Entity + Controller + 头像上传 |
| 邮箱验证流程 | 2 | 验证码表 + EmailService + 验证接口 |
| 密码重置流程 | 1 | 复用验证码机制 |
| 登录失败锁定 | 1 | Redis 计数 + 30分钟自动解锁 |
| Rate Limiting | 1.5 | Bucket4j 集成 + 关键端点配置 |
| 单元测试 + 集成测试 | 1.5 | 全流程覆盖 |

### Phase 3 — 约 12 工作日

| 任务 | 工作日 | 说明 |
|------|--------|------|
| OAuth2 集成（GitHub + 微信） | 4 | Provider 配置 + 账号绑定逻辑 |
| 多租户完善 | 3 | Tenant CRUD + 自动隔离 Filter + 配额 |
| 审计日志 | 3 | AOP 切面 + 日志表 + 查询/导出 API |
| Token 黑名单 + JTI | 1 | Redis 实现 |
| 安全审计 + 渗透测试 | 1 | 验证安全措施有效性 |

**总计：~22 工作日（约 1.5 个月）**

---

## 14. 风险与决策点

### 14.1 需 chenxi 确认的决策

1. **角色体系** — 建议在现有 5 级基础上新增 reviewer + contributor。还是需要完全重新设计角色（如更扁平的体系）？

2. **新注册默认角色** — 建议 `contributor`（可发布内容）。是否需要更保守的 `viewer`（只读，需管理员激活）？

3. **邮件服务** — 需要配置 SMTP 服务器。是否使用阿里云邮件推送服务（已有阿里云账号）？

4. **OAuth 优先级** — Phase 3 计划支持 GitHub + 微信。还有其他第三方登录需求（如飞书、钉钉）？

5. **多租户** — 当前 User 表已有 tenant_id 字段。是否有明确的多租户使用场景？还是暂时作为预留？

### 14.2 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| JWT Secret 泄露 | 低 | 高 | 环境变量注入，定期轮换，监控异常登录 |
| 邮件服务不稳定 | 中 | 中 | 验证码有效期 24h，支持重发，降级方案（手动激活） |
| Rate Limit 误杀正常用户 | 低 | 中 | 合理阈值 + 白名单 + 管理员可手动解锁 |
| OAuth Provider 变更 API | 低 | 低 | 抽象 Provider 接口，隔离第三方依赖 |

---

## 15. 与其他模块的依赖

| 依赖方向 | 模块 | 依赖点 | 说明 |
|----------|------|--------|------|
| 被依赖 | 评测系统（模块1）| 认证 + 角色检查 | 创建/查看任务需要对应角色 |
| 被依赖 | 社区（模块3）| 认证 + author_id | 发布内容需要已认证用户 |
| 被依赖 | 资源纳管（模块5）| 认证 + 租户隔离 | 资源按租户隔离 |
| 依赖 | Redis | Token 黑名单 + Rate Limit + 登录计数 | Phase 2 需 Redis |
| 依赖 | 邮件服务 | 验证邮件 + 密码重置 | Phase 2 需 SMTP |

用户体系是所有业务模块的基础，优先级最高，需确保稳定后再开发上层功能。

---

## Appendix A: 现有认证流程时序图

```
Client                    Backend                   Database
  |                         |                         |
  |-- POST /auth/login ---->|                         |
  |                         |-- findByEmail --------->|
  |                         |<-- User entity ---------|
  |                         |-- BCrypt.matches() ---->|
  |                         |-- update lastLoginAt -->|
  |                         |-- generateToken() ----->|
  |<-- {token, refresh} ----|                         |
  |                         |                         |
  |-- GET /api/xxx -------->|                         |
  |   [Bearer token]        |                         |
  |                         |-- JwtFilter: validate ->|
  |                         |-- load User by id ----->|
  |                         |<-- User entity ---------|
  |                         |-- SecurityContext set -->|
  |                         |-- @RequireRole check -->|
  |<-- response ------------|                         |
```

## Appendix B: 密码强度规则

| 规则 | 要求 | 当前实现 |
|------|------|----------|
| 最小长度 | 8 字符 | ✅ |
| 最大长度 | 32 字符 | ✅ |
| 大写字母 | 至少 1 个 | ✅ |
| 小写字母 | 至少 1 个 | ✅ |
| 数字 | 至少 1 个 | ✅ |
| 特殊字符 | 建议但不强制 | ❌ (Phase 2 可选) |
| 常见密码黑名单 | 禁止 top 1000 常见密码 | ❌ (Phase 3) |
