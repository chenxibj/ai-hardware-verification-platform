-- Migration V1.1: 新增评测对象、数据集、指标、结果、模板等核心表
-- Issue: #53 #37 #41 #43 #50 #60 #36

-- ==================== 评测对象管理 (#37) ====================

CREATE TABLE IF NOT EXISTS evaluation_objects (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    type            VARCHAR(32) NOT NULL,  -- MODEL/OPERATOR/FRAMEWORK/CHIP
    framework       VARCHAR(64),           -- PyTorch/ONNX/TensorFlow
    description     TEXT,
    metadata        JSONB DEFAULT '{}',    -- 参数量/输入输出格式等
    status          VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_by      BIGINT REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_eval_objects_type ON evaluation_objects(type);
CREATE INDEX idx_eval_objects_name ON evaluation_objects(name);

-- ==================== 评测对象版本管理 (#60) ====================

CREATE TABLE IF NOT EXISTS evaluation_object_versions (
    id                  BIGSERIAL PRIMARY KEY,
    object_id           BIGINT NOT NULL REFERENCES evaluation_objects(id) ON DELETE CASCADE,
    version             VARCHAR(32) NOT NULL,      -- 语义化版本 x.y.z
    description         TEXT,
    file_reference      VARCHAR(512),              -- MinIO 文件路径
    parent_version_id   BIGINT REFERENCES evaluation_object_versions(id),
    status              VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED', -- DRAFT/PUBLISHED/ARCHIVED
    created_by          BIGINT REFERENCES users(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(object_id, version)
);

CREATE INDEX idx_obj_versions_object ON evaluation_object_versions(object_id);

-- ==================== 数据集管理 (#41) ====================

CREATE TABLE IF NOT EXISTS datasets (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    type            VARCHAR(32) NOT NULL,  -- TEXT/IMAGE/AUDIO/MIXED
    format          VARCHAR(32),           -- CSV/JSON/PARQUET/CUSTOM
    size_bytes      BIGINT,
    sample_count    INTEGER,
    file_path       VARCHAR(512),          -- MinIO 路径
    is_system       BOOLEAN DEFAULT FALSE, -- 系统预置 vs 用户上传
    metadata        JSONB DEFAULT '{}',
    created_by      BIGINT REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_datasets_type ON datasets(type);
CREATE INDEX idx_datasets_is_system ON datasets(is_system);

-- ==================== 评测指标体系 (#43) ====================

CREATE TABLE IF NOT EXISTS evaluation_metrics (
    id              BIGSERIAL PRIMARY KEY,
    metric_key      VARCHAR(64) NOT NULL UNIQUE,  -- 英文标识 avg_latency
    metric_name     VARCHAR(128) NOT NULL,         -- 中文名 平均延迟
    category        VARCHAR(32) NOT NULL,          -- PERFORMANCE/ACCURACY/RESOURCE
    unit            VARCHAR(32),                   -- ms/samples_per_sec/%/MB
    data_type       VARCHAR(16) NOT NULL DEFAULT 'FLOAT', -- FLOAT/INT/STRING
    description     TEXT,
    eval_types      VARCHAR(64)[] DEFAULT '{}',    -- 适用的评测类型
    display_format  VARCHAR(32) DEFAULT '%.2f',    -- 展示格式
    is_key_metric   BOOLEAN DEFAULT FALSE,         -- 是否核心指标
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 评测结果数据 (#50) ====================

CREATE TABLE IF NOT EXISTS evaluation_results (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL REFERENCES evaluation_tasks(id) ON DELETE CASCADE,
    metric_key      VARCHAR(64) NOT NULL REFERENCES evaluation_metrics(metric_key),
    metric_value    DOUBLE PRECISION,
    string_value    VARCHAR(256),          -- 非数值型指标
    config_label    VARCHAR(128),          -- 配置标签 如 "batch_size=32"
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_results_task ON evaluation_results(task_id);
CREATE INDEX idx_results_metric ON evaluation_results(metric_key);
CREATE INDEX idx_results_task_metric ON evaluation_results(task_id, metric_key);

-- 任务环境信息表
CREATE TABLE IF NOT EXISTS task_environments (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL REFERENCES evaluation_tasks(id) ON DELETE CASCADE UNIQUE,
    cpu_model       VARCHAR(128),
    cpu_cores       INTEGER,
    memory_gb       INTEGER,
    os_info         VARCHAR(128),
    python_version  VARCHAR(16),
    framework_name  VARCHAR(64),
    framework_version VARCHAR(32),
    extra_packages  JSONB DEFAULT '[]',    -- [{name, version}]
    env_variables   JSONB DEFAULT '{}',    -- {key: value}
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 任务模板 (#36) ====================

CREATE TABLE IF NOT EXISTS task_templates (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    eval_type       VARCHAR(32) NOT NULL,
    config_json     JSONB NOT NULL,        -- 完整的任务配置
    is_system       BOOLEAN DEFAULT FALSE, -- 系统预置 vs 个人模板
    created_by      BIGINT REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_templates_eval_type ON task_templates(eval_type);
CREATE INDEX idx_templates_is_system ON task_templates(is_system);

-- ==================== 评测任务表增量字段 ====================

-- 添加 evaluation_tasks 缺失的字段
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS object_id BIGINT REFERENCES evaluation_objects(id);
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS object_version_id BIGINT REFERENCES evaluation_object_versions(id);
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES task_templates(id);
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS timeout_minutes INTEGER DEFAULT 30;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 0;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS retry_from_task_id BIGINT REFERENCES evaluation_tasks(id);
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ==================== 告警表 (#51) ====================

CREATE TABLE IF NOT EXISTS alerts (
    id              BIGSERIAL PRIMARY KEY,
    alert_type      VARCHAR(32) NOT NULL,  -- TASK_FAILED/TASK_TIMEOUT/TASK_OOM/SYSTEM_DB/SYSTEM_DISK/SYSTEM_API
    severity        VARCHAR(16) NOT NULL DEFAULT 'WARNING', -- INFO/WARNING/CRITICAL
    title           VARCHAR(256) NOT NULL,
    content         TEXT NOT NULL,
    task_id         BIGINT REFERENCES evaluation_tasks(id),
    user_id         BIGINT REFERENCES users(id),  -- 通知目标用户
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at         TIMESTAMP
);

CREATE INDEX idx_alerts_user ON alerts(user_id, is_read);
CREATE INDEX idx_alerts_type ON alerts(alert_type);

-- ==================== 报告增量字段 ====================

ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS version VARCHAR(16) DEFAULT 'v1.0';
ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS version_history JSONB DEFAULT '[]';
ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP;
ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS share_password VARCHAR(64);
ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS json_path VARCHAR(512);

-- ==================== 初始化评测指标 ====================

INSERT INTO evaluation_metrics (metric_key, metric_name, category, unit, data_type, eval_types, is_key_metric, sort_order) VALUES
('avg_latency', '平均推理延迟', 'PERFORMANCE', 'ms', 'FLOAT', '{MODEL,OPERATOR}', TRUE, 1),
('p50_latency', 'P50延迟', 'PERFORMANCE', 'ms', 'FLOAT', '{MODEL,OPERATOR}', FALSE, 2),
('p95_latency', 'P95延迟', 'PERFORMANCE', 'ms', 'FLOAT', '{MODEL,OPERATOR}', TRUE, 3),
('p99_latency', 'P99延迟', 'PERFORMANCE', 'ms', 'FLOAT', '{MODEL,OPERATOR}', FALSE, 4),
('throughput', '吞吐量', 'PERFORMANCE', 'samples/sec', 'FLOAT', '{MODEL}', TRUE, 5),
('tokens_per_sec', 'Token生成速度', 'PERFORMANCE', 'tokens/sec', 'FLOAT', '{MODEL}', FALSE, 6),
('peak_memory', '峰值内存', 'RESOURCE', 'MB', 'FLOAT', '{MODEL,OPERATOR}', TRUE, 7),
('cpu_utilization', 'CPU利用率', 'RESOURCE', '%', 'FLOAT', '{MODEL,OPERATOR}', FALSE, 8),
('gflops', 'GFLOPS', 'PERFORMANCE', 'GFLOPS', 'FLOAT', '{OPERATOR}', TRUE, 9),
('memory_bandwidth', '内存带宽利用率', 'PERFORMANCE', '%', 'FLOAT', '{OPERATOR}', FALSE, 10),
('top1_accuracy', 'Top-1准确率', 'ACCURACY', '%', 'FLOAT', '{MODEL}', TRUE, 11),
('top5_accuracy', 'Top-5准确率', 'ACCURACY', '%', 'FLOAT', '{MODEL}', FALSE, 12),
('exec_time_avg', '平均执行时间', 'PERFORMANCE', 'ms', 'FLOAT', '{OPERATOR}', TRUE, 13),
('exec_time_std', '执行时间标准差', 'PERFORMANCE', 'ms', 'FLOAT', '{OPERATOR}', FALSE, 14)
ON CONFLICT (metric_key) DO NOTHING;

-- ==================== 预置系统模板 ====================

INSERT INTO task_templates (name, description, eval_type, config_json, is_system) VALUES
('GPT-2 Small 标准推理评测', '在CPU上评测GPT-2 Small模型的推理性能', 'MODEL', 
 '{"object_type":"MODEL","framework":"PyTorch","python_version":"3.10","resource_spec":{"cpu_cores":4,"memory_gb":16},"eval_params":{"batch_sizes":[1,4,8],"num_iterations":100,"warmup":10}}', TRUE),
('DistilBERT 文本分类评测', '在CPU上评测DistilBERT的文本分类性能与准确率', 'MODEL',
 '{"object_type":"MODEL","framework":"PyTorch","python_version":"3.10","resource_spec":{"cpu_cores":4,"memory_gb":8},"eval_params":{"batch_sizes":[1,8,16],"num_iterations":200,"warmup":20}}', TRUE),
('算子性能基准测试', '在CPU上评测基础算子(MatMul/Conv2d/LayerNorm等)性能', 'OPERATOR',
 '{"object_type":"OPERATOR","framework":"PyTorch","python_version":"3.10","resource_spec":{"cpu_cores":4,"memory_gb":8},"eval_params":{"warmup":50,"iterations":500}}', TRUE)
ON CONFLICT DO NOTHING;

