package com.lab.task;

import com.lab.chipreport.ChipReportRepository;
import com.lab.chipreport.ReportGeneratorService;
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
import java.util.HashSet;
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
    private final com.lab.gpu.GpuSlotService gpuSlotService;
    private final TaskLifecycleService lifecycle;
    private final ChipReportRepository chipReportRepository;
    private final ReportGeneratorService reportGeneratorService;

    private static final Set<EvaluationTask.TaskStatus> TERMINAL_STATUSES = Set.of(
            EvaluationTask.TaskStatus.COMPLETED,
            EvaluationTask.TaskStatus.FAILED,
            EvaluationTask.TaskStatus.CANCELLED,
            EvaluationTask.TaskStatus.SKIPPED
    );

    @PostConstruct
    public void init() {
        log.info("TaskRecoveryScheduler initialized - scanning every 60s (fixedDelay, lastHeartbeatAt-based, DISPATCHED timeout: 2min, progress=0 timeout: 10min, general timeout: 15min)");
    }

    /**
     * TODO #493: 多实例部署时需要加 @SchedulerLock（ShedLock）防止多实例同时执行恢复任务。
     * 当前为单实例部署，暂不引入 ShedLock 依赖。
     * 多实例部署时需要：
     * 1. 引入 net.javacrumbs.shedlock:shedlock-spring + shedlock-provider-jdbc-template
     * 2. 创建 shedlock 表: CREATE TABLE shedlock(name VARCHAR(64) NOT NULL PRIMARY KEY, lock_until TIMESTAMP NOT NULL, locked_at TIMESTAMP NOT NULL, locked_by VARCHAR(255) NOT NULL);
     * 3. 启用 @EnableSchedulerLock(defaultLockAtMostFor = "PT5M")
     * 4. 在本方法加 @SchedulerLock(name = "recoverTasks", lockAtLeastFor = "PT30S", lockAtMostFor = "PT5M")
     */
    @Scheduled(fixedDelay = 60000)
    public void recoverTasks() {
        log.debug("TaskRecoveryScheduler scan cycle started");
        try {
            migratePendingToQueued();
            recoverStaleDispatchedTasks();  // #451: DISPATCHED but never polled
            recoverStaleRunningTasks();
            recoverOfflineNodeTasks();
            cleanupStalePendingTasks();
            completeFinishedPlans();
            generateMissingReports();  // #508: double insurance
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
     * #451: DISPATCHED 超时回退 → QUEUED（任务分发后 Agent 从未 poll）
     * DISPATCHED + lastHeartbeatAt 超过 2 分钟 → 回退为 QUEUED 重新排队
     * 这解决了任务被分发但 agent 没 poll 到、或并发分发竞态导致的卡死问题
     */
    @Transactional
    public void recoverStaleDispatchedTasks() {
        Instant threshold2 = Instant.now().minus(2, ChronoUnit.MINUTES);

        List<EvaluationTask> staleDispatched = taskRepository.findByStatusAndLastHeartbeatAtBefore(
                EvaluationTask.TaskStatus.DISPATCHED, threshold2);

        if (staleDispatched.isEmpty()) return;

        for (EvaluationTask task : staleDispatched) {
            log.warn("#451: Task {} ({}) stuck in DISPATCHED for >2min (never polled), rolling back to QUEUED",
                    task.getId(), task.getTaskNo());
            task.setStatus(EvaluationTask.TaskStatus.QUEUED);
            task.setAssignedNodeId(null);
            task.setStartedAt(null);
            task.setLastHeartbeatAt(null);
            task.setQueueReason("DISPATCHED 超时（>2min 未被 Agent 拉取），回退重新排队");
            taskRepository.save(task);

            // Release GPU slots if allocated
            try {
                gpuSlotService.releaseGpuSlots(task.getId());
            } catch (Exception e) {
                log.warn("Failed to release GPU slots for stale dispatched task {}: {}", task.getId(), e.getMessage());
            }
        }

        log.info("#451: Recovered {} stale DISPATCHED tasks -> QUEUED", staleDispatched.size());

        // Try to re-dispatch
        try {
            taskDispatcher.tryDispatchNext();
        } catch (Exception e) {
            log.debug("Post-dispatched-recovery dispatch failed: {}", e.getMessage());
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
        Instant threshold5 = Instant.now().minus(10, ChronoUnit.MINUTES);

        // Use lastHeartbeatAt for stale detection (more accurate than updatedAt)
        List<EvaluationTask> staleTasks = new ArrayList<>(
                taskRepository.findByStatusAndLastHeartbeatAtBefore(
                        EvaluationTask.TaskStatus.RUNNING, threshold15));

        // #492: Use Set<Long> for O(1) dedup instead of ArrayList.contains O(n)
        Set<Long> processedIds = new HashSet<>();
        for (EvaluationTask t : staleTasks) {
            processedIds.add(t.getId());
        }

        // #382/#509: Also catch RUNNING tasks with progress=0 after 10 minutes (using lastHeartbeatAt)
        List<EvaluationTask> stuckTasks = taskRepository.findByStatusAndLastHeartbeatAtBefore(
                EvaluationTask.TaskStatus.RUNNING, threshold5);
        for (EvaluationTask task : stuckTasks) {
            if (task.getProgress() != null && task.getProgress() == 0 && !processedIds.contains(task.getId())) {
                staleTasks.add(task);
                processedIds.add(task.getId());
            }
        }


        int failedCount = 0;
        int requeuedCount = 0;
        for (EvaluationTask task : staleTasks) {
            boolean neverStarted = task.getProgress() != null && task.getProgress() == 0;
            String reason = neverStarted
                    ? "RUNNING with progress=0 for >10min (never started)"
                    : "RUNNING for >15min without update";

            // #509: progress=0 tasks get re-queued (up to 2 retries) instead of immediately failing.
            // Root cause: poll-tasks transitions DISPATCHED->RUNNING on the server side, but if the
            // agent loses the HTTP response (network blip, timeout, restart), the task is orphaned
            // in RUNNING with progress=0 and no one executing it.
            int retries = task.getRetryCount() == null ? 0 : task.getRetryCount();
            if (neverStarted && retries < 2) {
                log.warn("#509: Task {} ({}) stale ({}), re-queuing (retry {}/2)",
                        task.getId(), task.getTaskNo(), reason, retries + 1);
                task.setStatus(EvaluationTask.TaskStatus.QUEUED);
                task.setRetryCount(retries + 1);
                task.setAssignedNodeId(null);
                task.setStartedAt(null);
                task.setLastHeartbeatAt(null);
                task.setAllocatedGpuIndices(null);
                task.setQueueReason(String.format("#509: progress=0 超时回退重试 (%d/2)", retries + 1));
                taskRepository.save(task);
                // Release GPU slots
                try {
                    gpuSlotService.releaseGpuSlots(task.getId());
                } catch (Exception e) {
                    log.warn("#509: Failed to release GPU slots for re-queued task {}: {}", task.getId(), e.getMessage());
                }
                requeuedCount++;
                continue;
            }

            log.warn("Task {} ({}) stale ({}), marking FAILED (retries exhausted: {})",
                    task.getId(), task.getTaskNo(), reason, retries);
            task.setStatus(EvaluationTask.TaskStatus.FAILED);
            task.setErrorMessage("任务超时: " + reason);
            task.setCompletedAt(Instant.now());
            taskRepository.save(task);

            // #489: 统一资源释放（GPU + 节点 + 调度）
            try {
                lifecycle.onTaskTerminated(task.getId());
            } catch (Exception e) {
                log.warn("#489: Lifecycle failed for timed-out task {}: {}", task.getId(), e.getMessage());
            }

            // #361: Create EvaluationResult for the timed-out task
            createTimeoutResult(task, reason);
            failedCount++;
        }

        if (requeuedCount > 0) {
            log.info("#509: Re-queued {} stale RUNNING tasks with progress=0 for retry", requeuedCount);
            try {
                taskDispatcher.tryDispatchNext();
            } catch (Exception e) {
                log.debug("Post-requeue dispatch failed: {}", e.getMessage());
            }
        }
        if (failedCount > 0) {
            log.info("Recovered {} stale RUNNING tasks -> FAILED", failedCount);
            // #490: Plan 进度已由 lifecycle.onTaskTerminated 内部的 PlanProgressService 统一处理
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
            // #406: 用户可读的中文超时信息
            long timeoutMinutes = reason.contains("progress=0") ? 10 : 15;
            result.setErrorMessage(String.format("任务超时：%d分钟内无进度更新，由系统自动终止（%s）", timeoutMinutes, reason));
            resultRepository.save(result);
            log.info("Created timeout EvaluationResult for task {} (planId={})", task.getId(), planId);
        } catch (Exception e) {
            log.warn("Failed to create timeout result for task {}: {}", task.getId(), e.getMessage());
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
                    // #497: Release GPU slots before resetting task
                    try {
                        gpuSlotService.releaseGpuSlots(task.getId());
                    } catch (Exception e) {
                        log.warn("#497: Failed to release GPU slots for task {} on offline node: {}", task.getId(), e.getMessage());
                    }
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
            // #489: 回收后触发调度
            try {
                taskDispatcher.tryDispatchNext();
            } catch (Exception e) {
                log.debug("Post-offline-recovery dispatch: {}", e.getMessage());
            }
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
            // #489: 统一资源释放
            try { lifecycle.onTaskTerminated(task.getId()); } catch (Exception ignored) {}
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

                // #383: Auto-generate report when plan completes
                if (plan.getStatus() == EvaluationPlan.PlanStatus.COMPLETED && completedCount > 0) {
                    try {
                        reportGeneratorService.generateReport(plan.getId());
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
     * #508: Double insurance - find COMPLETED plans that have no report and generate one.
     * This catches cases where the event-driven path (PlanCompletedEvent -> ReportGeneratorService)
     * failed silently (e.g., due to transaction context issues before the @Transactional fix).
     */
    @Transactional
    public void generateMissingReports() {
        List<EvaluationPlan> completedPlans = planRepository.findByStatus(
                EvaluationPlan.PlanStatus.COMPLETED,
                org.springframework.data.domain.PageRequest.of(0, 50)).getContent();

        for (EvaluationPlan plan : completedPlans) {
            // Check if a report already exists for this plan
            if (!chipReportRepository.findByPlanId(plan.getId()).isEmpty()) {
                continue;
            }

            // Check that at least one task completed successfully
            long completedTaskCount = taskRepository.findByPlanId(plan.getId()).stream()
                    .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.COMPLETED)
                    .count();
            if (completedTaskCount == 0) {
                continue;
            }

            log.warn("#508: Plan {} is COMPLETED but has no report - generating now (safety net)",
                    plan.getPlanNo());
            try {
                reportGeneratorService.generateReport(plan.getId());
                log.info("#508: Safety-net report generated for plan {}", plan.getPlanNo());
            } catch (Exception e) {
                log.error("#508: Safety-net report generation failed for plan {}: {}",
                        plan.getPlanNo(), e.getMessage());
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
}
