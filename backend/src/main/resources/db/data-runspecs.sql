-- ============================================================
-- 运行规格预置数据 (Issue #463)
-- 幂等: ON CONFLICT (code) DO NOTHING
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
