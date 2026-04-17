-- ============================================================
-- AHVP 数据库初始化脚本 (Issue #156)
-- 安全执行: IF NOT EXISTS / ON CONFLICT 保证幂等
-- ============================================================

-- 1. 补充 tenants 缺失列
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_code ON tenants(code);

-- 2. 补充索引
CREATE INDEX IF NOT EXISTS idx_results_task ON evaluation_results(task_id);
CREATE INDEX IF NOT EXISTS idx_plans_chip ON evaluation_plans(chip_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON evaluation_plans(status);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON compute_nodes(status);

-- 3. 默认租户更新
UPDATE tenants SET code = 'default', contact_email = 'admin@ahvp.com'
WHERE id = 1 AND code IS NULL;

-- 4. 预置评测模板
INSERT INTO task_templates (name, description, eval_type, config_json, is_system, created_at, updated_at, evaluation_layer, version)
SELECT * FROM (VALUES
    ('芯片综合评测', '全面评测芯片性能、精度、兼容性等多维度指标', 'PERFORMANCE',
     '{"mode":"FULL","dimensions":["performance","accuracy","compatibility","stability"],"timeout_minutes":120}'::jsonb,
     true, NOW(), NOW(), 'CHIP', '1.0'),
    ('芯片快速验证', '快速验证芯片基本功能和性能', 'PERFORMANCE',
     '{"mode":"QUICK","dimensions":["performance","accuracy"],"timeout_minutes":30}'::jsonb,
     true, NOW(), NOW(), 'CHIP', '1.0'),
    ('芯片精度专项', '专项测试芯片计算精度(FP16/FP32/INT8)', 'ACCURACY',
     '{"mode":"ACCURACY","dimensions":["accuracy"],"precision_modes":["FP16","FP32","INT8"],"timeout_minutes":60}'::jsonb,
     true, NOW(), NOW(), 'CHIP', '1.0'),
    ('算子性能标准测试', '标准算子性能基准测试，覆盖常用深度学习算子', 'PERFORMANCE',
     '{"mode":"STANDARD","target":"operator","operators":["conv2d","matmul","relu","softmax","batchnorm"],"timeout_minutes":60}'::jsonb,
     true, NOW(), NOW(), 'OPERATOR', '1.0'),
    ('算子精度验证', '验证算子计算精度，与参考实现对比误差', 'ACCURACY',
     '{"mode":"ACCURACY","target":"operator","threshold":0.00001,"timeout_minutes":45}'::jsonb,
     true, NOW(), NOW(), 'OPERATOR', '1.0'),
    ('算子压力测试', '算子长时间高负载压力测试，检测稳定性和内存泄漏', 'PERFORMANCE',
     '{"mode":"STRESS","target":"operator","duration_minutes":60,"concurrent":4,"timeout_minutes":90}'::jsonb,
     true, NOW(), NOW(), 'OPERATOR', '1.0'),
    ('模型推理标准测试', '标准模型推理性能测试，评估吞吐量和延迟', 'PERFORMANCE',
     '{"mode":"STANDARD","target":"model","metrics":["throughput","latency_p50","latency_p99"],"timeout_minutes":60}'::jsonb,
     true, NOW(), NOW(), 'MODEL', '1.0'),
    ('模型精度验证', '模型推理精度验证，与基准结果对比', 'ACCURACY',
     '{"mode":"ACCURACY","target":"model","compare_baseline":true,"timeout_minutes":45}'::jsonb,
     true, NOW(), NOW(), 'MODEL', '1.0'),
    ('大模型推理测试', 'LLM推理性能专项测试，评估Token生成速度和首Token延迟', 'PERFORMANCE',
     '{"mode":"LLM","target":"model","metrics":["tokens_per_second","time_to_first_token","throughput"],"timeout_minutes":120}'::jsonb,
     true, NOW(), NOW(), 'MODEL', '1.0'),
    ('多芯片横向对比', '多款芯片在相同任务上的横向性能对比', 'PERFORMANCE',
     '{"mode":"HORIZONTAL","comparison_type":"multi_chip","metrics":["performance","accuracy","efficiency"],"timeout_minutes":180}'::jsonb,
     true, NOW(), NOW(), 'COMPARISON', '1.0'),
    ('新旧版本纵向对比', '同芯片新旧版本纵向性能对比', 'PERFORMANCE',
     '{"mode":"VERTICAL","comparison_type":"version","metrics":["performance","accuracy","regression"],"timeout_minutes":120}'::jsonb,
     true, NOW(), NOW(), 'COMPARISON', '1.0'),
    ('行业基准对比', '与行业标准基准(MLPerf等)进行对比测试', 'PERFORMANCE',
     '{"mode":"BENCHMARK","comparison_type":"industry","benchmarks":["mlperf_inference","ai_benchmark"],"timeout_minutes":180}'::jsonb,
     true, NOW(), NOW(), 'COMPARISON', '1.0')
) AS v(name, description, eval_type, config_json, is_system, created_at, updated_at, evaluation_layer, version)
WHERE NOT EXISTS (SELECT 1 FROM task_templates t WHERE t.name = v.name AND t.is_system = true);

-- ============================================================
-- Community Resources table (#178 US-3.2)
-- ============================================================
CREATE TABLE IF NOT EXISTS community_resources (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(32) NOT NULL,
    file_name VARCHAR(255),
    file_path VARCHAR(512),
    file_size BIGINT,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_resources_category ON community_resources(category);

-- Seed data
INSERT INTO community_resources (name, description, category, file_name, file_size, download_count)
SELECT * FROM (VALUES
    ('PyTorch 评测基准镜像', '包含PyTorch 2.1、CUDA 12.1及常用评测依赖的Docker镜像', 'BENCHMARK_IMAGE', 'pytorch-benchmark-v2.1.tar.gz', 2147483648, 156),
    ('TensorFlow 评测基准镜像', '包含TensorFlow 2.14及标准推理评测环境', 'BENCHMARK_IMAGE', 'tensorflow-benchmark-v2.14.tar.gz', 1932735283, 89),
    ('算子精度评测脚本', '标准算子精度对比评测脚本套件，支持FP16/FP32/INT8', 'EVAL_SCRIPT', 'operator-accuracy-test-v1.2.zip', 5242880, 234),
    ('推理性能评测脚本', '模型推理性能基准测试脚本，支持延迟/吞吐/GPU利用率', 'EVAL_SCRIPT', 'inference-perf-bench-v1.0.zip', 3145728, 312),
    ('ResNet-50 FP16 基准值', 'ResNet-50模型FP16精度下的参考推理结果', 'BASELINE_DATA', 'resnet50-fp16-baseline.json', 1048576, 178),
    ('BERT-Large 基准值', 'BERT-Large模型各精度下的推理基准数据', 'BASELINE_DATA', 'bert-large-baseline.json', 2097152, 145),
    ('国产芯片评测最佳实践', '国产GPU/NPU芯片评测方法论与最佳实践指南', 'BEST_PRACTICE', 'domestic-chip-eval-guide-v2.pdf', 8388608, 423),
    ('大模型推理评测指南', 'LLM推理性能评测标准化流程与指标体系', 'BEST_PRACTICE', 'llm-inference-eval-guide.pdf', 6291456, 267),
    ('芯片评测报告模板-标准版', '标准芯片综合评测报告LaTeX模板', 'REPORT_TEMPLATE', 'chip-report-template-std.zip', 1572864, 198),
    ('对比评测报告模板', '多芯片横向对比评测报告模板', 'REPORT_TEMPLATE', 'comparison-report-template.zip', 1048576, 134)
) AS v(name, description, category, file_name, file_size, download_count)
WHERE NOT EXISTS (SELECT 1 FROM community_resources cr WHERE cr.name = v.name);

-- ============================================================
-- 运行规格预置数据 (Issue #463)
-- ============================================================
INSERT INTO run_specs (name, code, node_count, gpu_per_node, gpu_exclusive, cpu_cores, cpu_exclusive, memory_gb, parallel_mode, category, description, is_system)
VALUES
('单节点纯CPU', 'cpu-1', 1, 0, false, 4, false, 8, null, 'cpu', '适用于轻量CPU评测任务', true),
('单节点多核CPU', 'cpu-4', 1, 0, false, 16, false, 32, null, 'cpu', '适用于大规模CPU评测任务', true),
('单卡GPU', 'gpu-1', 1, 1, true, 8, false, 16, null, 'gpu', '适用于单卡GPU评测', true),
('双卡GPU', 'gpu-2', 1, 2, true, 16, false, 32, null, 'gpu', '适用于双卡GPU推理/训练', true),
('四卡GPU', 'gpu-4', 1, 4, true, 32, false, 64, null, 'gpu', '适用于多卡并行推理/训练', true),
('八卡GPU', 'gpu-8', 1, 8, true, 64, false, 128, null, 'gpu', '适用于全卡训练', true),
('双机四卡', 'multi-2x4', 2, 4, true, 32, false, 64, 'data_parallel', 'multi', '适用于数据并行分布式训练', true),
('四机八卡', 'multi-4x8', 4, 8, true, 64, false, 128, 'model_parallel', 'multi', '适用于模型并行大规模训练', true)
ON CONFLICT (code) DO NOTHING;
