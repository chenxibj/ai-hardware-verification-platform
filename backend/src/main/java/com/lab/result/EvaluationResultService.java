package com.lab.result;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.chip.ChipRepository;
import com.lab.gpu.GpuSlotService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import org.springframework.context.ApplicationEventPublisher;
import com.lab.plan.PlanCompletedEvent;

/**
 * 评测结果收集 + 评分计算服务
 * #135 - Agent 回报结果 → 保存 → 更新进度 → 触发报告
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EvaluationResultService {

    private final EvaluationResultRepository resultRepository;
    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final ComputeNodeRepository nodeRepository;
    private final ChipRepository chipRepository;
    private final GpuSlotService gpuSlotService;

    /**
     * Agent 提交任务结果
     */
    @Transactional
    public EvaluationResult submitResult(Long taskId, String rawData) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        // 解析指标摘要
        Map<String, Object> metrics = extractMetrics(rawData);

        // 根据评测类型计算评分
        String evalType = task.getTestSubject() != null ? task.getTestSubject().name() : "OPERATOR";
        double score = calculateScore(metrics, evalType);

        // #353: chipId 防御 — 如果 task 没有 chipId，从 Plan 获取
        Long chipId = task.getChipId();
        if (chipId == null && task.getPlanId() != null) {
            EvaluationPlan plan = planRepository.findById(task.getPlanId()).orElse(null);
            if (plan != null) {
                chipId = plan.getChipId();
                log.info("Task {} chipId was null, resolved from plan: {}", taskId, chipId);
            }
        }

        // 保存结果
        EvaluationResult result = new EvaluationResult();
        result.setTaskId(taskId);
        result.setPlanId(task.getPlanId());
        result.setChipId(chipId);
        result.setRawData(rawData);

        Map<String, Object> summary = new HashMap<>(metrics);
        summary.put("score", score);
        summary.put("eval_type", evalType);
        try {
            result.setMetricsSummary(objectMapper.writeValueAsString(summary));
        } catch (Exception e) {
            result.setMetricsSummary("{\"score\":" + score + "}");
        }
        result.setPassed(score >= 60.0);
        try {
            result = resultRepository.save(result);
        } catch (Exception dbEx) {
            log.error("#353 Failed to save result for task {}: {}", taskId, dbEx.getMessage());
            throw new RuntimeException("Failed to save evaluation result: " + dbEx.getMessage(), dbEx);
        }

        // 更新任务状态
        task.setStatus(EvaluationTask.TaskStatus.COMPLETED);
        task.setProgress(100);
        task.setCompletedAt(Instant.now());
        taskRepository.save(task);

        // 更新计划进度
        updatePlanProgress(task.getPlanId());

        // #222: 释放节点
        releaseNode(task.getAssignedNodeId());
        // #403: 释放 GPU Slot
        try { gpuSlotService.releaseGpuSlots(task.getId()); } catch (Exception e) { log.warn("GPU slot release failed for task {}: {}", taskId, e.getMessage()); }
        log.info("Result submitted for task {} (score={}, metrics={})", taskId, score, metrics.keySet());
        return result;
    }

    /**
     * Agent 报告任务失败
     */
    @Transactional
    public EvaluationResult submitFailure(Long taskId, String errorMessage) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        // #353: chipId 防御
        Long chipId = task.getChipId();
        if (chipId == null && task.getPlanId() != null) {
            EvaluationPlan plan = planRepository.findById(task.getPlanId()).orElse(null);
            if (plan != null) chipId = plan.getChipId();
        }

        EvaluationResult result = new EvaluationResult();
        result.setTaskId(taskId);
        result.setPlanId(task.getPlanId());
        result.setChipId(chipId);
        result.setPassed(false);
        result.setErrorMessage(errorMessage);
        try {
            result = resultRepository.save(result);
        } catch (Exception dbEx) {
            log.error("Failed to save failure result for task {}: {}", taskId, dbEx.getMessage());
            // #353: 不让 DB 异常拖垮连接池，快速释放
            throw new RuntimeException("Failed to save result: " + dbEx.getMessage(), dbEx);
        }

        task.setStatus(EvaluationTask.TaskStatus.FAILED);
        task.setErrorMessage(errorMessage != null && errorMessage.length() > 500 ? errorMessage.substring(0, 500) : errorMessage);
        task.setCompletedAt(Instant.now());
        taskRepository.save(task);

        updatePlanProgress(task.getPlanId());

        // #222: 释放节点
        releaseNode(task.getAssignedNodeId());
        // #403: 释放 GPU Slot
        try { gpuSlotService.releaseGpuSlots(task.getId()); } catch (Exception e) { log.warn("GPU slot release failed for task {}: {}", taskId, e.getMessage()); }
        log.info("Failure reported for task {}: {}", taskId, errorMessage);
        return result;
    }

    /**
     * 更新计划进度，检查是否所有任务完成
     */
    private void updatePlanProgress(Long planId) {
        if (planId == null) return;
        EvaluationPlan plan = planRepository.findById(planId).orElse(null);
        if (plan == null) return;

        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
        int total = tasks.size();
        long completed = tasks.stream()
                .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.COMPLETED ||
                             t.getStatus() == EvaluationTask.TaskStatus.FAILED ||
                             t.getStatus() == EvaluationTask.TaskStatus.SKIPPED)
                .count();
        long failed = tasks.stream()
                .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.FAILED ||
                             t.getStatus() == EvaluationTask.TaskStatus.SKIPPED)
                .count();

        plan.setCompletedTasks((int) completed);
        plan.setProgress(total > 0 ? (int) (completed * 100 / total) : 0);

        if (completed == total) {
            plan.setCompletedAt(Instant.now());
            if (failed > 0 && failed == total) {
                plan.setStatus(EvaluationPlan.PlanStatus.FAILED);
            } else {
                plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
            }
            log.info("Plan {} completed (total={}, failed={})", plan.getPlanNo(), total, failed);
            // trigger report generation
            eventPublisher.publishEvent(new PlanCompletedEvent(this, planId));
        }

        planRepository.save(plan);
    }

    /**
     * #222: 释放节点，让后续任务可以被分发
     */
    private void releaseNode(Long nodeId) {
        if (nodeId == null) return;
        try {
            nodeRepository.findById(nodeId).ifPresent(node -> {
                if (node.getStatus() == ComputeNode.Status.BUSY) {
                    node.setStatus(ComputeNode.Status.ONLINE);
                    nodeRepository.save(node);
                    log.info("Node {} released back to ONLINE", node.getName());
                }
            });
        } catch (Exception e) {
            log.warn("Failed to release node {}: {}", nodeId, e.getMessage());
        }
    }

    /**
     * 从 Agent 上报的嵌套 JSON 中提取实际评测指标
     * 
     * Agent 上报格式:
     * {
     *   "status": "COMPLETED",
     *   "result": {
     *     "eval_result": {
     *       "benchmark_name": "cpu_operator_benchmark",
     *       "results": [{ "operator": "MatMul", "latency_ms_mean": 1.932, ... }],
     *       "summary": { "avg_latency_ms": 1.932, "pass_rate": 100.0 }
     *     },
     *     "runtime_metrics": { ... }
     *   },
     *   "logs": "..."
     * }
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> extractMetrics(String rawData) {
        try {
            Map<String, Object> data = objectMapper.readValue(rawData, new TypeReference<>() {});

            Map<String, Object> metrics = new LinkedHashMap<>();

            // 尝试从 result.eval_result 提取
            Object resultObj = data.get("result");
            if (resultObj instanceof Map) {
                Map<String, Object> result = (Map<String, Object>) resultObj;
                Object evalResult = result.get("eval_result");
                if (evalResult instanceof Map) {
                    Map<String, Object> eval = (Map<String, Object>) evalResult;

                    // 提取 summary（avg_latency_ms, pass_rate 等）
                    Object summary = eval.get("summary");
                    if (summary instanceof Map) {
                        metrics.putAll((Map<String, Object>) summary);
                    }

                    // 提取 results 数组中每个算子/模型的详细指标
                    Object results = eval.get("results");
                    if (results instanceof List) {
                        List<Map<String, Object>> resultList = (List<Map<String, Object>>) results;
                        metrics.put("details", resultList);

                        // 如果只有一个结果，把关键指标提到顶层
                        if (resultList.size() == 1) {
                            Map<String, Object> single = resultList.get(0);
                            for (Map.Entry<String, Object> e : single.entrySet()) {
                                if (e.getValue() instanceof Number || "status".equals(e.getKey())) {
                                    metrics.put(e.getKey(), e.getValue());
                                }
                            }
                        }

                        // 提取每个 operator/model 的关键指标摘要
                        List<Map<String, Object>> operatorMetrics = new ArrayList<>();
                        for (Map<String, Object> r : resultList) {
                            Map<String, Object> op = new LinkedHashMap<>();
                            op.put("name", r.getOrDefault("operator", r.getOrDefault("model", "unknown")));
                            op.put("status", r.getOrDefault("status", "N/A"));
                            for (Map.Entry<String, Object> e : r.entrySet()) {
                                if (e.getValue() instanceof Number) {
                                    op.put(e.getKey(), e.getValue());
                                }
                            }
                            operatorMetrics.add(op);
                        }
                        metrics.put("operators", operatorMetrics);
                    }

                    // 提取 config 信息
                    Object config = eval.get("config");
                    if (config instanceof Map) {
                        metrics.put("config", config);
                    }

                    // benchmark info
                    metrics.put("benchmark_name", eval.getOrDefault("benchmark_name", "unknown"));
                }

                // runtime_metrics
                Object runtimeMetrics = result.get("runtime_metrics");
                if (runtimeMetrics instanceof Map) {
                    metrics.put("runtime", runtimeMetrics);
                }
            }

            // 如果上面没提取到任何东西，回退到直接从顶层读数值字段
            if (metrics.isEmpty()) {
                for (Map.Entry<String, Object> e : data.entrySet()) {
                    if (e.getValue() instanceof Number) {
                        metrics.put(e.getKey(), e.getValue());
                    }
                }
            }

            // #239: Extract accuracy metrics from accuracy_results array
            Object accuracyResults = null;
            if (resultObj instanceof Map) {
                Map<String, Object> resultMap = (Map<String, Object>) resultObj;
                Object evalResult = resultMap.get("eval_result");
                if (evalResult instanceof Map) {
                    accuracyResults = ((Map<String, Object>) evalResult).get("accuracy_results");
                }
            }
            if (accuracyResults == null) {
                accuracyResults = data.get("accuracy_results");
            }
            if (accuracyResults instanceof List) {
                List<Map<String, Object>> accList = (List<Map<String, Object>>) accuracyResults;
                metrics.put("accuracy_results", accList);

                // Summarize accuracy
                Map<String, Object> accSummary = new LinkedHashMap<>();
                int accPass = 0, accWarn = 0, accFail = 0;
                for (Map<String, Object> acc : accList) {
                    String verdict = (String) acc.getOrDefault("verdict", "UNKNOWN");
                    if ("PASS".equals(verdict)) accPass++;
                    else if ("WARNING".equals(verdict)) accWarn++;
                    else if ("FAIL".equals(verdict)) accFail++;
                }
                accSummary.put("total", accList.size());
                accSummary.put("pass", accPass);
                accSummary.put("warning", accWarn);
                accSummary.put("fail", accFail);
                if (!accList.isEmpty()) {
                    accSummary.put("accuracy_pass_rate",
                        Math.round(accPass * 1000.0 / accList.size()) / 10.0);
                }
                // Add avg cosine_similarity
                double sumCos = 0;
                int cosCnt = 0;
                for (Map<String, Object> acc : accList) {
                    Object cos = acc.get("cosine_similarity");
                    if (cos instanceof Number) {
                        sumCos += ((Number) cos).doubleValue();
                        cosCnt++;
                    }
                }
                if (cosCnt > 0) {
                    accSummary.put("avg_cosine_similarity", Math.round(sumCos / cosCnt * 100000000.0) / 100000000.0);
                }
                metrics.put("accuracy", accSummary);
            }

            // #239: Extract dtypes_tested from summary
            Object summaryObj = null;
            if (resultObj instanceof Map) {
                Map<String, Object> resultMap = (Map<String, Object>) resultObj;
                Object evalResult = resultMap.get("eval_result");
                if (evalResult instanceof Map) {
                    summaryObj = ((Map<String, Object>) evalResult).get("summary");
                }
            }
            if (summaryObj instanceof Map) {
                Map<String, Object> sum = (Map<String, Object>) summaryObj;
                Object dtypes = sum.get("dtypes_tested");
                if (dtypes != null) metrics.put("dtypes_tested", dtypes);
                Object avgGflops = sum.get("avg_gflops");
                if (avgGflops != null) metrics.put("avg_gflops", avgGflops);
                Object maxGflops = sum.get("max_gflops");
                if (maxGflops != null) metrics.put("max_gflops", maxGflops);
            }

            log.info("Extracted metrics keys: {}", metrics.keySet());
            return metrics;
        } catch (Exception e) {
            log.warn("Failed to extract metrics: {}", e.getMessage());
            return new HashMap<>();
        }
    }

    /**
     * 评分算法 — 根据评测类型使用不同的指标和权重
     * 
     * OPERATOR 评测：latency_ms_mean/p50/p95 + throughput_ops + pass_rate
     * MODEL 评测：inference_time_ms/p50/p95 + throughput_fps + accuracy + memory_mb
     */
    public double calculateScore(Map<String, Object> metrics, String evalType) {
        if ("MODEL".equalsIgnoreCase(evalType)) {
            return calculateModelScore(metrics);
        }
        return calculateOperatorScore(metrics);
    }

    /**
     * 向后兼容的 calculateScore（无 evalType 时默认 OPERATOR）
     */
    public double calculateScore(Map<String, Object> metrics) {
        return calculateScore(metrics, "OPERATOR");
    }

    /**
     * 算子评测评分
     * 关键指标：latency_ms_mean/p50/p95, throughput_ops, pass_rate, status
     */
    private double calculateOperatorScore(Map<String, Object> metrics) {
        double totalScore = 0;
        double totalWeight = 0;

        // 1. 延迟评分 (权重 0.4) — 尝试多个延迟指标名
        double latency = getFirstMetric(metrics, "latency_ms_mean", "latency_ms_p50", "avg_latency_ms", "latency_mean");
        if (latency > 0) {
            totalScore += scoreLatency(latency) * 0.4;
            totalWeight += 0.4;
        }

        // 2. 吞吐量评分 (权重 0.3) — 尝试多个名称
        double throughput = getFirstMetric(metrics, "throughput_ops", "throughput", "throughput_fps");
        if (throughput > 0) {
            totalScore += scoreThroughput(throughput) * 0.3;
            totalWeight += 0.3;
        }

        // 3. 通过率评分 (权重 0.2)
        double passRate = getFirstMetric(metrics, "pass_rate");
        if (passRate > 0) {
            totalScore += passRate * 0.2; // pass_rate 本身就是 0-100
            totalWeight += 0.2;
        }

        // 4. 状态加分 (权重 0.1)
        Object status = metrics.get("status");
        if ("PASS".equals(status)) {
            totalScore += 100 * 0.1;
            totalWeight += 0.1;
        } else if ("FAIL".equals(status)) {
            totalScore += 0;
            totalWeight += 0.1;
        }

        if (totalWeight > 0) {
            return totalScore / totalWeight;
        }

        // 无可识别指标 → 默认50分
        return 50;
    }

    /**
     * 模型推理评测评分
     * 关键指标：inference_time_ms/p50, throughput_fps, memory_mb, accuracy
     */
    private double calculateModelScore(Map<String, Object> metrics) {
        double totalScore = 0;
        double totalWeight = 0;

        // 1. 推理延迟评分 (权重 0.3) — latency 系列 + inference_time 系列
        double latency = getFirstMetric(metrics, "inference_time_ms", "inference_time_ms_p50",
                "latency_ms_mean", "latency_ms_p50", "avg_latency_ms");
        if (latency > 0) {
            totalScore += scoreLatency(latency) * 0.3;
            totalWeight += 0.3;
        }

        // 2. 吞吐量评分 (权重 0.25)
        double throughput = getFirstMetric(metrics, "throughput_fps", "throughput_ops", "throughput");
        if (throughput > 0) {
            totalScore += scoreThroughput(throughput) * 0.25;
            totalWeight += 0.25;
        }

        // 3. 精度评分 (权重 0.25)
        double accuracy = getFirstMetric(metrics, "accuracy", "output_verified");
        if (accuracy > 0) {
            // accuracy 可能是 0-1 或 0-100
            double accScore = accuracy <= 1.0 ? accuracy * 100 : accuracy;
            totalScore += accScore * 0.25;
            totalWeight += 0.25;
        }

        // 4. 内存效率评分 (权重 0.1)
        double memoryMb = getFirstMetric(metrics, "memory_mb", "memory_usage_mb");
        if (memoryMb > 0) {
            totalScore += scoreMemory(memoryMb) * 0.1;
            totalWeight += 0.1;
        }

        // 5. 通过率/状态 (权重 0.1)
        double passRate = getFirstMetric(metrics, "pass_rate");
        if (passRate > 0) {
            totalScore += passRate * 0.1;
            totalWeight += 0.1;
        }

        if (totalWeight > 0) {
            return totalScore / totalWeight;
        }

        return 50;
    }

    /**
     * 从 metrics 中按优先级查找第一个存在且 >0 的指标值
     */
    private double getFirstMetric(Map<String, Object> metrics, String... keys) {
        for (String key : keys) {
            if (metrics.containsKey(key)) {
                double val = toDouble(metrics.get(key));
                if (val > 0) return val;
            }
        }
        return 0;
    }

    /**
     * 延迟评分：<1ms=100, 1-5ms=80-100, 5-20ms=60-80, 20-100ms=40-60, >100ms=0-40
     */
    private double scoreLatency(double latencyMs) {
        if (latencyMs <= 0) return 50;
        if (latencyMs < 1) return 100;
        if (latencyMs < 5) return 80 + (5 - latencyMs) / 4 * 20;
        if (latencyMs < 20) return 60 + (20 - latencyMs) / 15 * 20;
        if (latencyMs < 100) return 40 + (100 - latencyMs) / 80 * 20;
        return Math.max(0, 20 - (latencyMs - 100) / 100 * 20);
    }

    /**
     * 吞吐量评分：>1000=100, 500-1000=80-100, 100-500=60-80, 10-100=40-60, <10=0-40
     */
    private double scoreThroughput(double throughput) {
        if (throughput <= 0) return 0;
        if (throughput >= 1000) return 100;
        if (throughput >= 500) return 80 + (throughput - 500) / 500 * 20;
        if (throughput >= 100) return 60 + (throughput - 100) / 400 * 20;
        if (throughput >= 10) return 40 + (throughput - 10) / 90 * 20;
        return Math.max(0, throughput / 10 * 20);
    }

    /**
     * 内存评分：<500MB=100, 500-2000=70-100, 2000-8000=40-70, >8000=0-40
     */
    private double scoreMemory(double memoryMb) {
        if (memoryMb <= 0) return 50;
        if (memoryMb < 500) return 100;
        if (memoryMb < 2000) return 70 + (2000 - memoryMb) / 1500 * 30;
        if (memoryMb < 8000) return 40 + (8000 - memoryMb) / 6000 * 30;
        return Math.max(0, 40 - (memoryMb - 8000) / 8000 * 40);
    }

    /**
     * 计算各维度评分
     */
    public Map<String, Double> calculateDimensionScores(Long planId) {
        List<EvaluationResult> results = resultRepository.findByPlanId(planId);
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);

        // Map taskId -> task for test subject lookup
        Map<Long, EvaluationTask> taskMap = new HashMap<>();
        for (EvaluationTask t : tasks) {
            taskMap.put(t.getId(), t);
        }

        // Categorize scores by dimension
        Map<String, List<Double>> dimScores = new HashMap<>();
        String[] dimensions = {"compute_perf", "memory_perf", "math_func", "attention", "normalization", "model_inference"};
        for (String d : dimensions) {
            dimScores.put(d, new ArrayList<>());
        }

        for (EvaluationResult r : results) {
            if (r.getMetricsSummary() == null) continue;
            try {
                Map<String, Object> metrics = objectMapper.readValue(r.getMetricsSummary(), new TypeReference<>() {});
                // Compute score from latency instead of trusting stored score field
                Map<String, Object> flatM = flattenMetrics(metrics);
                double lat = toDouble(flatM.getOrDefault("latency_ms_mean", flatM.getOrDefault("latency_mean", flatM.getOrDefault("latencyMean", flatM.getOrDefault("avg_latency_ms", 0)))));
                // Only include entries with valid latency data in dimension scoring
                if (lat <= 0) continue;
                double score = Math.max(0, Math.min(100, 100 - 20 * Math.log10(lat)));
                EvaluationTask task = taskMap.get(r.getTaskId());
                String dimension = categorizeToDimension(task);
                if (dimScores.containsKey(dimension)) {
                    dimScores.get(dimension).add(score);
                }
            } catch (Exception e) {
                log.warn("Failed to parse metrics for result {}", r.getId(), e);
            }
        }

        // Average per dimension
        Map<String, Double> result = new LinkedHashMap<>();
        for (String dim : dimensions) {
            List<Double> scores = dimScores.get(dim);
            if (scores.isEmpty()) {
                result.put(dim, 0.0); // no data for this dimension
            } else {
                result.put(dim, scores.stream().mapToDouble(Double::doubleValue).average().orElse(0));
            }
        }
        return result;
    }

    /**
     * 综合评分 = 各维度等权平均
     */
    public double calculateOverallScore(Map<String, Double> dimensionScores) {
        return dimensionScores.values().stream()
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(50);
    }

    /**
     * 根据任务的 testItem 分类到六维度
     */
    private String categorizeToDimension(EvaluationTask task) {
        if (task == null) return "compute_perf";
        String item = task.getTestItem();
        if (item == null) {
            return task.getTestSubject() == EvaluationTask.TestSubject.MODEL
                    ? "model_inference" : "compute_perf";
        }
        String lower = item.toLowerCase();
        if (lower.contains("matmul") || lower.contains("conv") || lower.contains("gemm") || lower.contains("linear")) return "compute_perf";
        if (lower.contains("transpose") || lower.contains("embedding") || lower.contains("concat") ||
            lower.contains("gather") || lower.contains("scatter") || lower.contains("memcpy") || lower.contains("bandwidth")) return "memory_perf";
        if (lower.contains("relu") || lower.contains("gelu") || lower.contains("silu") || lower.contains("sigmoid") ||
            lower.contains("tanh") || lower.contains("softmax")) return "math_func";
        if (lower.contains("attention") || lower.contains("scaleddotproduct") || lower.contains("flash")) return "attention";
        if (lower.contains("layernorm") || lower.contains("batchnorm") || lower.contains("rmsnorm") || lower.contains("norm")) return "normalization";
        if (lower.contains("mlp") || lower.contains("resnet") || lower.contains("bert") || lower.contains("llama") || lower.contains("model") || lower.contains("inference")) return "model_inference";
        return "compute_perf";
    }

    private double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }

    /**
     * Flatten nested metrics structure for score calculation.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> flattenMetrics(Map<String, Object> metrics) {
        Map<String, Object> flat = new LinkedHashMap<>(metrics);
        try {
            Object resultObj = metrics.get("result");
            if (resultObj instanceof Map) {
                Map<String, Object> result = (Map<String, Object>) resultObj;
                Object evalResult = result.get("eval_result");
                if (evalResult instanceof Map) {
                    Map<String, Object> eval = (Map<String, Object>) evalResult;
                    Object summary = eval.get("summary");
                    if (summary instanceof Map) {
                        flat.putAll((Map<String, Object>) summary);
                    }
                    Object results = eval.get("results");
                    if (results instanceof java.util.List) {
                        java.util.List<Object> resultList = (java.util.List<Object>) results;
                        if (!resultList.isEmpty() && resultList.get(0) instanceof Map) {
                            ((Map<String, Object>) resultList.get(0)).forEach(flat::putIfAbsent);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Failed to flatten metrics: {}", e.getMessage());
        }
        return flat;
    }

}
