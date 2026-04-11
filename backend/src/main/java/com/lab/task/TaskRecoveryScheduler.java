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
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 任务异常恢复调度器
 * 
 * 不再轮询分发任务！分发由事件驱动（见 TaskDispatcher.tryDispatchNext）：
 * - 新任务创建时
 * - 任务完成/失败释放节点时
 * - 节点心跳从 OFFLINE 恢复时
 * 
 * 本调度器只负责异常恢复：
 * 1. RUNNING 超时 → FAILED
 * 2. OFFLINE 节点的 RUNNING 任务 → QUEUED
 * 3. PENDING/QUEUED 超 24h → CANCELLED
 * 4. 所有 Task 终态 → 完成 Plan
 * 5. 启动时迁移 PENDING → QUEUED
 * 6. #358: QUEUED 任务兜底重调度（每60秒尝试一次）
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

    @Scheduled(fixedRate = 60000) // 每60秒，只做异常恢复
    public void recoverTasks() {
        try {
            migratePendingToQueued();
            recoverStaleRunningTasks();
            recoverOfflineNodeTasks();
            cleanupStalePendingTasks();
            completeFinishedPlans();
            retryQueuedIfPossible();  // #358: 兜底重调度
        } catch (Exception e) {
            log.error("Task recovery scheduler error: {}", e.getMessage(), e);
        }
    }

    /**
     * 迁移遗留 PENDING 任务为 QUEUED（向后兼容）
     */
    @Transactional
    public void migratePendingToQueued() {
        List<EvaluationTask> pendingTasks = taskRepository.findByStatus(EvaluationTask.TaskStatus.PENDING);
        if (!pendingTasks.isEmpty()) {
            for (EvaluationTask task : pendingTasks) {
                task.setStatus(EvaluationTask.TaskStatus.QUEUED);
                taskRepository.save(task);
            }
            log.info("Migrated {} PENDING tasks to QUEUED", pendingTasks.size());

            // 迁移后尝试分发
            try {
                taskDispatcher.tryDispatchNext();
            } catch (Exception e) {
                log.debug("Post-migration dispatch failed: {}", e.getMessage());
            }
        }
    }

    /**
     * RUNNING 超 15 分钟无更新 → FAILED
     */
    @Transactional
    public void recoverStaleRunningTasks() {
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
            log.info("Recovered {} stale RUNNING tasks -> FAILED", staleTasks.size());
            // 释放节点后尝试分发排队任务
            try {
                taskDispatcher.tryDispatchNext();
            } catch (Exception e) {
                log.debug("Post-recovery dispatch failed: {}", e.getMessage());
            }
        }
    }

    /**
     * 节点 OFFLINE → 其上的 RUNNING Task 回 QUEUED 等待重分发
     */
    @Transactional
    public void recoverOfflineNodeTasks() {
        List<ComputeNode> offlineNodes = nodeRepository.findByStatus(ComputeNode.Status.OFFLINE);
        int recovered = 0;

        for (ComputeNode node : offlineNodes) {
            List<EvaluationTask> nodeTasks = taskRepository.findByAssignedNodeId(node.getId());
            for (EvaluationTask task : nodeTasks) {
                if (task.getStatus() == EvaluationTask.TaskStatus.RUNNING) {
                    log.warn("Node {} is OFFLINE, resetting task {} to QUEUED for re-dispatch",
                            node.getName(), task.getTaskNo());
                    task.setStatus(EvaluationTask.TaskStatus.QUEUED);
                    task.setAssignedNodeId(null);
                    task.setStartedAt(null);
                    task.setLastHeartbeatAt(null);
                    taskRepository.save(task);
                    recovered++;
                }
            }
        }

        if (recovered > 0) {
            log.info("Recovered {} tasks from OFFLINE nodes -> QUEUED", recovered);
        }
    }

    /**
     * QUEUED/PENDING 超 24h → CANCELLED
     */
    @Transactional
    public void cleanupStalePendingTasks() {
        Instant threshold = Instant.now().minus(24, ChronoUnit.HOURS);
        List<EvaluationTask> staleTasks = new ArrayList<>(
                taskRepository.findByStatusAndCreatedAtBefore(EvaluationTask.TaskStatus.QUEUED, threshold));
        staleTasks.addAll(
                taskRepository.findByStatusAndCreatedAtBefore(EvaluationTask.TaskStatus.PENDING, threshold));

        for (EvaluationTask task : staleTasks) {
            log.info("Auto-cancelling stale task {} (QUEUED/PENDING for >24h)", task.getTaskNo());
            task.setStatus(EvaluationTask.TaskStatus.CANCELLED);
            task.setCompletedAt(Instant.now());
            taskRepository.save(task);
        }
        if (!staleTasks.isEmpty()) {
            log.info("Auto-cancelled {} stale QUEUED/PENDING tasks", staleTasks.size());
        }
    }

    /**
     * 所有 Task 终态但 Plan=RUNNING → complete Plan
     */
    @Transactional
    public void completeFinishedPlans() {
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


    /**
     * #358/#359: 兜底重调度 — tryDispatchNext 现在已经是批量分发了
     */
    private void retryQueuedIfPossible() {
        long queuedCount = taskRepository.countByStatus(EvaluationTask.TaskStatus.QUEUED);
        if (queuedCount > 0) {
            log.debug("Found {} QUEUED tasks, attempting batch fallback dispatch", queuedCount);
            try {
                taskDispatcher.tryDispatchNext();
            } catch (Exception e) {
                log.debug("Queued retry attempt failed: {}", e.getMessage());
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
