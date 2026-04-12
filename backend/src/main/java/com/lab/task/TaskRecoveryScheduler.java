package com.lab.task;

import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.plan.EvaluationPlan;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.result.EvaluationResult;
import com.lab.result.EvaluationResultRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;
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
 * 1. RUNNING 超时 → FAILED（并写入 EvaluationResult）
 * 2. OFFLINE 节点的 RUNNING 任务 → QUEUED
 * 3. PENDING/QUEUED 超 24h → CANCELLED
 * 4. 所有 Task 终态 → 完成 Plan
 * 5. 启动时迁移 PENDING → QUEUED
 * 6. #358: QUEUED 任务兜底重调度（每60秒尝试一次）
 * 7. #361/#382: 超时任务写入失败结果 + 更新 Plan 进度
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TaskRecoveryScheduler {

    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final ComputeNodeRepository nodeRepository;
    private final EvaluationResultRepository resultRepository;
    private final TaskDispatcher taskDispatcher;
    private final com.lab.scoring.ReportGenerator reportGenerator;

    private static final Set<EvaluationTask.TaskStatus> TERMINAL_STATUSES = Set.of(
            EvaluationTask.TaskStatus.COMPLETED,
            EvaluationTask.TaskStatus.FAILED,
            EvaluationTask.TaskStatus.CANCELLED,
            EvaluationTask.TaskStatus.SKIPPED
    );

    @PostConstruct
    public void init() {
        log.info("TaskRecoveryScheduler initialized - scanning every 60s (progress=0 timeout: 5min, general timeout: 15min)");
    }

    @Scheduled(fixedRate = 60000)
    public void recoverTasks() {
        log.debug("TaskRecoveryScheduler scan cycle started");
        try {
            migratePendingToQueued();
            recoverStaleRunningTasks();
            recoverOfflineNodeTasks();
            cleanupStalePendingTasks();
            completeFinishedPlans();
            cancelTerminatedPlanTasks();
            retryQueuedIfPossible();
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
                if (task.getQueueReason() == null) {
                    task.setQueueReason("从 PENDING 迁移至排队状态，等待可用节点");
                }
                taskRepository.save(task);
            }
            log.info("Migrated {} PENDING tasks to QUEUED", pendingTasks.size());

            try {
                taskDispatcher.tryDispatchNext();
            } catch (Exception e) {
                log.debug("Post-migration dispatch failed: {}", e.getMessage());
            }
        }
    }

    /**
     * #380/#382: RUNNING 超时 → FAILED + 写入 EvaluationResult
     * - progress=0 且超过 5 分钟 → FAILED（任务从未真正开始）
     * - 任何 RUNNING 超过 15 分钟无更新 → FAILED
     * #361: 同时创建失败的 EvaluationResult，确保 plan_id 不为 null
     */
    @Transactional
    public void recoverStaleRunningTasks() {
        Instant threshold15 = Instant.now().minus(15, ChronoUnit.MINUTES);
        Instant threshold5 = Instant.now().minus(5, ChronoUnit.MINUTES);

        List<EvaluationTask> staleTasks = new ArrayList<>(
                taskRepository.findByStatusAndUpdatedAtBefore(
                        EvaluationTask.TaskStatus.RUNNING, threshold15));

        // #382: Also catch RUNNING tasks with progress=0 after 5 minutes
        List<EvaluationTask> stuckTasks = taskRepository.findByStatusAndUpdatedAtBefore(
                EvaluationTask.TaskStatus.RUNNING, threshold5);
        for (EvaluationTask task : stuckTasks) {
            if (task.getProgress() != null && task.getProgress() == 0 && !staleTasks.contains(task)) {
                staleTasks.add(task);
            }
        }

        // Track affected planIds for progress update
        java.util.Set<Long> affectedPlanIds = new java.util.HashSet<>();

        for (EvaluationTask task : staleTasks) {
            String reason = (task.getProgress() != null && task.getProgress() == 0)
                    ? "RUNNING with progress=0 for >5min (never started)"
                    : "RUNNING for >15min without update";
            log.warn("Task {} ({}) stale ({}), marking FAILED",
                    task.getId(), task.getTaskNo(), reason);
            task.setStatus(EvaluationTask.TaskStatus.FAILED);
            task.setCompletedAt(Instant.now());
            taskRepository.save(task);

            // #361: Create EvaluationResult for the timed-out task
            createTimeoutResult(task, reason);

            if (task.getPlanId() != null) {
                affectedPlanIds.add(task.getPlanId());
            }

            // 释放节点
            if (task.getAssignedNodeId() != null) {
                releaseNode(task.getAssignedNodeId());
            }
        }

        if (!staleTasks.isEmpty()) {
            log.info("Recovered {} stale RUNNING tasks -> FAILED", staleTasks.size());

            // #361/#382: Update progress for all affected plans
            for (Long planId : affectedPlanIds) {
                updatePlanProgress(planId);
            }

            // 释放节点后尝试分发排队任务
            try {
                taskDispatcher.tryDispatchNext();
            } catch (Exception e) {
                log.debug("Post-recovery dispatch failed: {}", e.getMessage());
            }
        }
    }

    /**
     * #361: 为超时任务创建失败的 EvaluationResult
     * 确保 planId 从 Task 正确传递，不为 null
     */
    private void createTimeoutResult(EvaluationTask task, String reason) {
        try {
            // Check if result already exists for this task
            if (resultRepository.findByTaskId(task.getId()).isPresent()) {
                return;
            }

            EvaluationResult result = new EvaluationResult();
            result.setTaskId(task.getId());

            // #361: Ensure planId is set — resolve from task, fallback to DB lookup
            Long planId = task.getPlanId();
            result.setPlanId(planId);

            // Resolve chipId — from task or from plan
            Long chipId = task.getChipId();
            if (chipId == null && planId != null) {
                planRepository.findById(planId).ifPresent(plan -> {
                    result.setChipId(plan.getChipId());
                });
            } else {
                result.setChipId(chipId);
            }

            result.setPassed(false);
            result.setErrorMessage("Task timeout: " + reason);
            resultRepository.save(result);
            log.info("Created timeout EvaluationResult for task {} (planId={})", task.getId(), planId);
        } catch (Exception e) {
            log.warn("Failed to create timeout result for task {}: {}", task.getId(), e.getMessage());
        }
    }

    /**
     * #361/#382: 更新 Plan 进度（任务回收后同步更新）
     */
    private void updatePlanProgress(Long planId) {
        try {
            EvaluationPlan plan = planRepository.findById(planId).orElse(null);
            if (plan == null) return;

            List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
            int total = tasks.size();
            long completed = tasks.stream()
                    .filter(t -> TERMINAL_STATUSES.contains(t.getStatus()))
                    .count();

            plan.setCompletedTasks((int) completed);
            plan.setProgress(total > 0 ? (int) (completed * 100 / total) : 0);
            planRepository.save(plan);
            log.debug("Updated plan {} progress: {}/{} ({}%)", plan.getPlanNo(), completed, total, plan.getProgress());
        } catch (Exception e) {
            log.warn("Failed to update plan {} progress: {}", planId, e.getMessage());
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
                if ((task.getStatus() == EvaluationTask.TaskStatus.RUNNING || task.getStatus() == EvaluationTask.TaskStatus.DISPATCHED)) {
                    log.warn("Node {} is OFFLINE, resetting task {} to QUEUED for re-dispatch",
                            node.getName(), task.getTaskNo());
                    task.setStatus(EvaluationTask.TaskStatus.QUEUED);
                    task.setAssignedNodeId(null);
                    task.setStartedAt(null);
                    task.setLastHeartbeatAt(null);
                    task.setQueueReason(String.format("节点 %s 离线，等待重新调度", node.getName()));
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

        java.util.Set<Long> affectedPlanIds = new java.util.HashSet<>();

        for (EvaluationTask task : staleTasks) {
            log.info("Auto-cancelling stale task {} (QUEUED/PENDING for >24h)", task.getTaskNo());
            task.setStatus(EvaluationTask.TaskStatus.CANCELLED);
            task.setCompletedAt(Instant.now());
            taskRepository.save(task);
            if (task.getPlanId() != null) affectedPlanIds.add(task.getPlanId());
        }
        if (!staleTasks.isEmpty()) {
            log.info("Auto-cancelled {} stale QUEUED/PENDING tasks", staleTasks.size());
            for (Long planId : affectedPlanIds) {
                updatePlanProgress(planId);
            }
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

                // #383: Auto-generate report when plan completes
                if (plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED && completedCount > 0) {
                    try {
                        reportGenerator.generateReport(plan.getId());
                        log.info("Auto-generated report for plan {}", plan.getPlanNo());
                    } catch (Exception e) {
                        log.warn("Failed to auto-generate report for plan {}: {}",
                                plan.getPlanNo(), e.getMessage());
                    }
                }
            }
        }
    }

    /**
     * #359: 主动取消已终态方案（CANCELLED/COMPLETED）下的 QUEUED 任务
     */
    @Transactional
    public void cancelTerminatedPlanTasks() {
        List<EvaluationTask> queuedTasks = taskRepository.findByStatus(EvaluationTask.TaskStatus.QUEUED);
        int cancelled = 0;
        for (EvaluationTask task : queuedTasks) {
            if (task.getPlanId() == null) continue;
            var planOpt = planRepository.findById(task.getPlanId());
            if (planOpt.isEmpty()) continue;
            var plan = planOpt.get();
            if (plan.getStatus() == EvaluationPlan.PlanStatus.CANCELLED ||
                plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED) {
                task.setStatus(EvaluationTask.TaskStatus.CANCELLED);
                task.setCompletedAt(Instant.now());
                taskRepository.save(task);
                log.info("Auto-cancelled QUEUED task {} (plan {} is {})",
                    task.getTaskNo(), plan.getPlanNo(), plan.getStatus());
                cancelled++;
            }
        }
        if (cancelled > 0) {
            log.info("Proactively cancelled {} QUEUED tasks from terminated plans", cancelled);
        }
    }

    /**
     * #358/#359: 兜底重调度
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
