package com.lab.result;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
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

    /**
     * Agent 提交任务结果
     */
    @Transactional
    public EvaluationResult submitResult(Long taskId, String rawData) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        // 解析指标摘要
        Map<String, Object> metrics = extractMetrics(rawData);
        double score = calculateScore(metrics);

        // 保存结果
        EvaluationResult result = new EvaluationResult();
        result.setTaskId(taskId);
        result.setPlanId(task.getPlanId());
        result.setChipId(task.getChipId());
        result.setRawData(rawData);

        Map<String, Object> summary = new HashMap<>(metrics);
        summary.put("score", score);
        try {
            result.setMetricsSummary(objectMapper.writeValueAsString(summary));
        } catch (Exception e) {
            result.setMetricsSummary("{\"score\":" + score + "}");
        }
        result.setPassed(score >= 60.0);
        result = resultRepository.save(result);

        // 更新任务状态
        task.setStatus(EvaluationTask.TaskStatus.COMPLETED);
        task.setProgress(100);
        task.setCompletedAt(Instant.now());
        taskRepository.save(task);

        // 更新计划进度
        updatePlanProgress(task.getPlanId());

        // #222: 释放节点
        releaseNode(task.getAssignedNodeId());
        log.info("Result submitted for task {} (score={})", taskId, score);
        return result;
    }

    /**
     * Agent 报告任务失败
     */
    @Transactional
    public EvaluationResult submitFailure(Long taskId, String errorMessage) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        EvaluationResult result = new EvaluationResult();
        result.setTaskId(taskId);
        result.setPlanId(task.getPlanId());
        result.setChipId(task.getChipId());
        result.setPassed(false);
        result.setErrorMessage(errorMessage);
        result = resultRepository.save(result);

        task.setStatus(EvaluationTask.TaskStatus.FAILED);
        task.setCompletedAt(Instant.now());
        taskRepository.save(task);

        updatePlanProgress(task.getPlanId());

        // #222: 释放节点
        releaseNode(task.getAssignedNodeId());
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
     * 评分算法：基于延迟和吞吐量计算 0-100 分
     */
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
    public double calculateScore(Map<String, Object> metrics) {
        double latencyScore = 50;
        double throughputScore = 50;
        boolean hasLatency = false;
        boolean hasThroughput = false;

        if (metrics.containsKey("latency_mean")) {
            double latency = toDouble(metrics.get("latency_mean"));
            latencyScore = scoreLatency(latency);
            hasLatency = true;
        }
        if (metrics.containsKey("throughput")) {
            double throughput = toDouble(metrics.get("throughput"));
            throughputScore = scoreThroughput(throughput);
            hasThroughput = true;
        }

        if (hasLatency && hasThroughput) {
            return latencyScore * 0.5 + throughputScore * 0.5;
        } else if (hasLatency) {
            return latencyScore;
        } else if (hasThroughput) {
            return throughputScore;
        }
        return 50; // 无数据时默认
    }

    /**
     * 延迟评分：<1ms=100, 1-5ms=80, 5-20ms=60, 20-100ms=40, >100ms=20
     */
    private double scoreLatency(double latencyMs) {
        if (latencyMs < 1) return 100;
        if (latencyMs < 5) return 80 + (5 - latencyMs) / 4 * 20;
        if (latencyMs < 20) return 60 + (20 - latencyMs) / 15 * 20;
        if (latencyMs < 100) return 40 + (100 - latencyMs) / 80 * 20;
        return Math.max(0, 20 - (latencyMs - 100) / 100 * 20);
    }

    /**
     * 吞吐量评分：>1000=100, 500-1000=80, 100-500=60, 10-100=40, <10=20
     */
    private double scoreThroughput(double throughput) {
        if (throughput >= 1000) return 100;
        if (throughput >= 500) return 80 + (throughput - 500) / 500 * 20;
        if (throughput >= 100) return 60 + (throughput - 100) / 400 * 20;
        if (throughput >= 10) return 40 + (throughput - 10) / 90 * 20;
        return Math.max(0, throughput / 10 * 20);
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
                double score = toDouble(metrics.getOrDefault("score", 50));
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
                result.put(dim, 50.0); // default
            } else {
                result.put(dim, scores.stream().mapToDouble(Double::doubleValue).average().orElse(50));
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

    private Map<String, Object> extractMetrics(String rawData) {
        try {
            return objectMapper.readValue(rawData, new TypeReference<>() {});
        } catch (Exception e) {
            return new HashMap<>();
        }
    }

    private double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0; }
    }
}
