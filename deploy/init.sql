-- 人工智能软硬件验证平台 - 数据库初始化脚本
-- 版本：V1.0
-- 创建时间：2026-03-30

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== 用户体系模块 ====================

-- 用户表
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(64) UNIQUE NOT NULL,
    email           VARCHAR(128) UNIQUE NOT NULL,
    phone           VARCHAR(20),
    password_hash   VARCHAR(256) NOT NULL,
    user_type       VARCHAR(32) NOT NULL DEFAULT 'INDIVIDUAL', -- INDIVIDUAL/ENTERPRISE/RESEARCH/Admin
    avatar_url      VARCHAR(512),
    status          VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE/INACTIVE/BANNED
    email_verified  BOOLEAN DEFAULT FALSE,
    phone_verified  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 租户表
CREATE TABLE tenants (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    resource_quota  JSONB,
    status          VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户租户关联表
CREATE TABLE user_tenants (
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role            VARCHAR(32) NOT NULL DEFAULT 'MEMBER', -- OWNER/ADMIN/MEMBER
    joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tenant_id)
);

-- ==================== 评测任务模块 ====================

-- 评测任务表
CREATE TABLE evaluation_tasks (
    id                  BIGSERIAL PRIMARY KEY,
    task_no             VARCHAR(64) UNIQUE NOT NULL,
    task_type           VARCHAR(32) NOT NULL, -- TEMPLATE/CUSTOM
    eval_type           VARCHAR(32) NOT NULL, -- MODEL/CHIP/FRAMEWORK/OPERATOR
    status              VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING/QUEUED/RUNNING/COMPLETED/FAILED/CANCELLED
    priority            VARCHAR(16) NOT NULL DEFAULT 'MEDIUM', -- HIGH/MEDIUM/LOW
    
    -- 评测配置
    eval_config         JSONB NOT NULL,
    dataset_ids         BIGINT[],
    resource_spec       JSONB,
    
    -- 资源分配
    allocated_resources JSONB,
    resource_pool_id    BIGINT,
    
    -- 进度信息
    progress            INTEGER DEFAULT 0,
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    
    -- 审计字段
    created_by          BIGINT NOT NULL REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    -- 拆分字段
    plan_id             BIGINT,
    chip_id             BIGINT,
    test_subject        VARCHAR(16) CHECK (test_subject IN (OPERATOR, MODEL)),
    test_item           VARCHAR(64),
    dimension           VARCHAR(32)
);

-- 任务日志表
CREATE TABLE task_logs (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL REFERENCES evaluation_tasks(id) ON DELETE CASCADE,
    level           VARCHAR(16) NOT NULL, -- INFO/WARN/ERROR
    message         TEXT NOT NULL,
    details         JSONB,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 评测报告模块 ====================

-- 评测报告表
CREATE TABLE evaluation_reports (
    id              BIGSERIAL PRIMARY KEY,
    report_no       VARCHAR(64) UNIQUE NOT NULL,
    task_id         BIGINT NOT NULL REFERENCES evaluation_tasks(id),
    
    -- 报告内容
    report_type     VARCHAR(32) NOT NULL, -- BASIC/ADVANCED
    summary         JSONB NOT NULL,
    metrics         JSONB NOT NULL,
    charts          JSONB,
    
    -- 文件存储
    pdf_path        VARCHAR(512),
    html_path       VARCHAR(512),
    
    -- 分享信息
    is_public       BOOLEAN DEFAULT FALSE,
    share_token     VARCHAR(64),
    
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 资源管理模块 ====================

-- 资源池表
CREATE TABLE resource_pools (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    type            VARCHAR(32) NOT NULL, -- CPU/GPU/MIXED
    description     TEXT,
    capacity        JSONB NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 资源表
CREATE TABLE resources (
    id              BIGSERIAL PRIMARY KEY,
    pool_id         BIGINT NOT NULL REFERENCES resource_pools(id),
    node_name       VARCHAR(128) NOT NULL,
    cpu_cores       INTEGER NOT NULL,
    memory_gb       INTEGER NOT NULL,
    gpu_model       VARCHAR(64),
    gpu_count       INTEGER DEFAULT 0,
    status          VARCHAR(32) NOT NULL DEFAULT 'IDLE', -- IDLE/BUSY/OFFLINE/MAINTENANCE
    current_tasks   BIGINT[],
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 索引 ====================

-- 用户表索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- 任务表索引
CREATE INDEX idx_tasks_status ON evaluation_tasks(status);
CREATE INDEX idx_tasks_created_by ON evaluation_tasks(created_by);
CREATE INDEX idx_tasks_created_at ON evaluation_tasks(created_at);
CREATE INDEX idx_tasks_status_priority ON evaluation_tasks(status, priority);

-- 任务日志索引
CREATE INDEX idx_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_logs_created_at ON task_logs(created_at);

-- 报告表索引
CREATE INDEX idx_reports_task_id ON evaluation_reports(task_id);
CREATE INDEX idx_reports_share_token ON evaluation_reports(share_token);

-- 资源表索引
CREATE INDEX idx_resources_pool_id ON resources(pool_id);
CREATE INDEX idx_resources_status ON resources(status);

-- ==================== 初始数据 ====================

-- 插入默认管理员用户（密码：Admin@123456）
INSERT INTO users (username, email, password_hash, user_type, status, email_verified)
VALUES ('admin', 'admin@ahvp.com', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iDJdLX6sX7mZ9qKxL5sJ8vK9sL5e', 'ADMIN', 'ACTIVE', TRUE);

-- 插入默认租户
INSERT INTO tenants (name, description, resource_quota, status)
VALUES ('Default Tenant', '默认租户', '{"cpu_cores": 100, "memory_gb": 256, "max_concurrent_tasks": 10}', 'ACTIVE');

-- 关联管理员到默认租户
INSERT INTO user_tenants (user_id, tenant_id, role)
VALUES (1, 1, 'OWNER');

-- 插入默认资源池
INSERT INTO resource_pools (name, type, description, capacity, status)
VALUES ('CPU Pool', 'CPU', 'CPU 资源池', '{"cpu_cores": 32, "memory_gb": 64}', 'ACTIVE');

-- 插入默认资源
INSERT INTO resources (pool_id, node_name, cpu_cores, memory_gb, status)
VALUES (1, 'cpu-node-001', 8, 16, 'IDLE');

-- 完成
COMMENT ON DATABASE ahvp IS '人工智能软硬件验证平台数据库';
