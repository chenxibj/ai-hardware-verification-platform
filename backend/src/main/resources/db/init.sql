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
