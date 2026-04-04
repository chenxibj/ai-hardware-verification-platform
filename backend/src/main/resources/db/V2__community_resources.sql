
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
