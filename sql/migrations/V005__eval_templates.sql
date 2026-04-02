-- Evaluation Template Management System
-- Issue: #105

-- Note: Using JPA entity auto-creation (TaskTemplate.java)
-- This SQL is for reference / manual PostgreSQL setup

CREATE TABLE IF NOT EXISTS task_template (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  eval_type VARCHAR(50) DEFAULT 'GENERAL',
  config_json TEXT DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System preset templates (inserted by DataInitializer on startup)
-- 1. CPU 算子基准评测 - 10 core operators benchmark
-- 2. CPU 模型推理评测 - Model inference performance
-- 3. 算子精简快测 - Quick operator regression test
