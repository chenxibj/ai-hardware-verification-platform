package com.lab.task;

import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 断链修复器 — 定期扫描并修复异常任务
 * #223
 * 
 * 1. RUNNING 超 15min 无更新 → FAILED
 * 2. PENDING + Plan=RUNNING → 重新分发
 * 3. 所有 Task 终态但 Plan=RUNNING → complete Plan
 * 4. 节点 OFFLINE → 其 Task 回 PENDING 重分发
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TaskRecoveryScheduler {

    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final ComputeNodeRepository nodeRepository;
    private final TaskDispatcher taskDispatcher;

    private static final Set<EvaluationTask.TaskStatus> TERMINAL_STATUSES = Set.of(
            EvaluationTask.TaskStatus.COMPLETED,
            EvaluationTask.TaskStatus.FAILED,
            EvaluationTask.TaskStatus.CANCELLED,
            EvaluationTask.TaskStatus.SKIPPED
    );

    @Scheduled(fixedRate = 60000) // 每分钟执行一次
    @Transactional
    public void recoverTasks() {
        try {
            recoverStaleRunningTasks();
            recoverOfflineNodeTasks();
            redispatchPendingTasks();
            completeFinishedPlans();
        } catch (Exception e) {
            log.error("Task recovery scheduler error: {}", e.getMessage(), e);
        }
    }

    /**
     * 1. RUNNING 超 15 分钟无更新 → FAILED
     */
    private void recoverStaleRunningTasks() {
        Instant threshold = Instant.now().minus(15, ChronoUnit.MINUTES);
        List<EvaluationTask> staleTasks = taskRepository.findByStatusAndUpdatedAtBefore(
                EvaluationTask.TaskStatus.RUNNING, threshold);

        for (EvaluationTask task : staleTasks) {
            log.warn("Task {} ({}) stale (RUNNING for >15min without update), marking FAILED",
                    task.getId(), task.getTaskNo());
            task.setStatus(EvaluationTask.TaskStatus.FAILED);
            task.setCompletedAt(Instant.now());
            taskRepository.save(task);

            // 释放节点
            if (task.getAssignedNodeId() != null) {
                releaseNode(task.getAssignedNodeId());
            }
        }

        if (!staleTasks.isEmpty()) {
            log.info("Recovered {} stale RUNNING tasks → FAILED", staleTasks.size());
        }
    }

    /**
     * 4. 节点 OFFLINE → 其上的 RUNNING Task 回 PENDING 重分发
     */
    private void recoverOfflineNodeTasks() {
        List<ComputeNode> offlineNodes = nodeRepository.findByStatus(ComputeNode.Status.OFFLINE);

        for (ComputeNode node : offlineNodes) {
            List<EvaluationTask> nodeTasks = taskRepository.findByAssignedNodeId(node.getId());
            for (EvaluationTask task : nodeTasks) {
                if (task.getStatus() == EvaluationTask.TaskStatus.RUNNING) {
                    log.warn("Node {} is OFFLINE, resetting task {} to PENDING for re-dispatch",
                            node.getName(), task.getTaskNo());
                    task.setStatus(EvaluationTask.TaskStatus.PENDING);
                    task.setAssignedNodeId(null);
                    task.setStartedAt(null);
                    task.setLastHeartbeatAt(null);
                    taskRepository.save(task);
                }
            }
        }
    }

    /**
     * 2. PENDING + Plan=RUNNING → 重新分发
     */
    private void redispatchPendingTasks() {
        List<EvaluationTask> pendingTasks = taskRepository.findByStatus(EvaluationTask.TaskStatus.PENDING);

        for (EvaluationTask task : pendingTasks) {
            if (task.getPlanId() == null) continue;
            EvaluationPlan plan = planRepository.findById(task.getPlanId()).orElse(null);
            if (plan != null && plan.getStatus() == EvaluationPlan.PlanStatus.RUNNING) {
                try {
                    taskDispatcher.dispatchSingleTask(task);
                } catch (Exception e) {
                    log.debug("Re-dispatch attempt for task {} failed: {}", task.getTaskNo(), e.getMessage());
                }
            }
        }
    }

    /**
     * 3. 所有 Task 终态但 Plan=RUNNING → complete Plan
     */
    private void completeFinishedPlans() {
        // 找到所有 RUNNING 的 Plan
        List<EvaluationPlan> runningPlans = planRepository.findByStatus(
                EvaluationPlan.PlanStatus.RUNNING,
                org.springframework.data.domain.PageRequest.of(0, 100)).getContent();

        for (EvaluationPlan plan : runningPlans) {
            List<EvaluationTask> tasks = taskRepository.findByPlanId(plan.getId());
            if (tasks.isEmpty()) continue;

            boolean allTerminal = tasks.stream()
                    .allMatch(t -> TERMINAL_STATUSES.contains(t.getStatus()));

            if (allTerminal) {
                long failedCount = tasks.stream()
                        .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.FAILED)
                        .count();
                long completedCount = tasks.stream()
                        .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.COMPLETED)
                        .count();

                plan.setCompletedTasks(tasks.size());
                plan.setProgress(100);
                plan.setCompletedAt(Instant.now());

                if (failedCount == tasks.size()) {
                    plan.setStatus(EvaluationPlan.PlanStatus.FAILED);
                } else {
                    plan.setStatus(EvaluationPlan.PlanStatus.COMPLETED);
                }

                planRepository.save(plan);
                log.info("Plan {} auto-completed (completed={}, failed={}, total={})",
                        plan.getPlanNo(), completedCount, failedCount, tasks.size());
            }
        }
    }

    private void releaseNode(Long nodeId) {
        try {
            nodeRepository.findById(nodeId).ifPresent(node -> {
                if (node.getStatus() == ComputeNode.Status.BUSY) {
                    node.setStatus(ComputeNode.Status.ONLINE);
                    nodeRepository.save(node);
                }
            });
        } catch (Exception e) {
            log.warn("Failed to release node {}: {}", nodeId, e.getMessage());
        }
    }
}
