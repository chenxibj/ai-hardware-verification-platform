package com.lab.task;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import com.lab.plan.EvaluationPlanRepository;
import com.lab.plan.EvaluationPlan;
import java.util.List;
import com.lab.common.XssUtils;
import java.util.Optional;
import com.lab.user.UserRepository;
import com.lab.config.TaskLogWebSocketHandler;
import org.springframework.context.ApplicationContext;

/**
 * 评测任务服务
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EvaluationTaskService {

    private final EvaluationTaskRepository taskRepository;
    private final TaskLogRepository taskLogRepository;
    private final EvaluationPlanRepository planRepository;
    private final TaskLogWebSocketHandler webSocketHandler;
    private final ApplicationContext applicationContext;
    private final UserRepository userRepository;
    private final TaskLifecycleService lifecycle;

    /**
     * 创建评测任务
     */
    @Transactional
    public EvaluationTask createTask(CreateTaskRequest request, Long userId) {
        // #376: Validate planId exists if provided
        if (request.getPlanId() != null) {
            planRepository.findById(request.getPlanId())
                .orElseThrow(() -> new com.lab.common.BusinessException(
                    com.lab.common.ErrorCode.NOT_FOUND, "评测计划不存在: " + request.getPlanId()));
        }

        EvaluationTask task = new EvaluationTask();
        task.setTaskNo(generateTaskNo());
        String taskName = request.getName() != null ? XssUtils.stripXss(request.getName()) : "Task-" + task.getTaskNo();
        task.setName(taskName);
        task.setTaskType(request.getTaskType());
        task.setEvalType(request.getEvalType());
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setPriority(request.getPriority());
        task.setEvalConfig(request.getEvalConfig());
        task.setDatasetIds(request.getDatasetIds());
        task.setResourceSpec(request.getResourceSpec());
        task.setCreatedBy(userId);
        task.setProgress(0);
        // #364: Set planId, chipId, testSubject, testItem from request
        task.setPlanId(request.getPlanId());
        task.setChipId(request.getChipId());
        task.setTestSubject(request.getTestSubject());
        task.setTestItem(request.getTestItem());

        EvaluationTask saved = taskRepository.save(task);
        log.info("Created task: {} (status=QUEUED)", saved.getTaskNo());

        // #388: Do NOT auto-dispatch on creation. Task stays QUEUED.
        // User must explicitly call /execute or /start to dispatch.

        return saved;
    }

    /**
     * 查询任务列表
     */
    @Transactional(readOnly = true)
    public Page<EvaluationTask> listTasks(Long userId, Long planId, Long chipId, EvaluationTask.TaskStatus status, Pageable pageable) {
        // #321: chipId filter takes priority
        if (chipId != null) {
            return taskRepository.findByChipId(chipId, pageable);
        }
        if (planId != null) {
            return taskRepository.findByPlanId(planId, pageable);
        }
        if (userId != null && status != null) {
            return taskRepository.findByUserIdAndStatus(userId, status, pageable);
        } else if (userId != null) {
            return taskRepository.findByCreatedBy(userId, pageable);
        } else if (status != null) {
            return taskRepository.findByStatus(status, pageable);
        }
        return taskRepository.findAll(pageable);
    }

    /**
     * 查询任务详情
     */
    @Transactional(readOnly = true)
    public Optional<EvaluationTask> getTaskDetail(Long taskId) {
        return taskRepository.findById(taskId);
    }

    /**
     * 查询任务详情（通过任务编号）
     */
    @Transactional(readOnly = true)
    public Optional<EvaluationTask> getTaskByTaskNo(String taskNo) {
        return taskRepository.findByTaskNo(taskNo);
    }

    /**
     * 更新任务状态
     */
    @Transactional
    public EvaluationTask updateTaskStatus(Long taskId, EvaluationTask.TaskStatus status, String message) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        EvaluationTask.TaskStatus oldStatus = task.getStatus();
        task.setStatus(status);
        
        // 状态转换时的处理
        if (status == EvaluationTask.TaskStatus.RUNNING && oldStatus != EvaluationTask.TaskStatus.RUNNING) {
            task.setStartedAt(Instant.now());
            // #365: When task goes RUNNING, auto-update parent plan from DRAFT to RUNNING
            if (task.getPlanId() != null) {
                planRepository.findById(task.getPlanId()).ifPresent(plan -> {
                    if (plan.getStatus() == com.lab.plan.EvaluationPlan.PlanStatus.DRAFT) {
                        plan.setStatus(com.lab.plan.EvaluationPlan.PlanStatus.RUNNING);
                        plan.setStartedAt(Instant.now());
                        planRepository.save(plan);
                        log.info("#365: Plan {} auto-transitioned DRAFT -> RUNNING (task {} started)",
                                plan.getPlanNo(), taskId);
                    }
                });
            }
        } else if (status == EvaluationTask.TaskStatus.COMPLETED || 
                   status == EvaluationTask.TaskStatus.FAILED) {
            task.setCompletedAt(Instant.now());
            task.setProgress(100);
        } else if (status == EvaluationTask.TaskStatus.CANCELLED) {
            // #374: CANCELLED tasks keep their current progress, don't force to 100
            task.setCompletedAt(Instant.now());
        }

        EvaluationTask saved = taskRepository.save(task);
        log.info("Updated task {} status from {} to {}", taskId, oldStatus, status);

        // #339: Write status change to task logs so completed tasks have log entries
        try {
            TaskLog statusLog = new TaskLog();
            statusLog.setTaskId(taskId);
            statusLog.setLevel("INFO");
            statusLog.setMessage(String.format("任务状态变更: %s → %s%s", oldStatus, status,
                    message != null ? " (" + message + ")" : ""));
            statusLog.setContent(statusLog.getMessage());
            statusLog.setLogType("STATUS");
            statusLog.setSource("SYSTEM");
            if (saved.getPlanId() != null) statusLog.setPlanId(saved.getPlanId());
            taskLogRepository.save(statusLog);
        } catch (Exception e) {
            log.warn("Failed to write status log: {}", e.getMessage());
        }
        // #229: Broadcast status change via WebSocket
        try { webSocketHandler.broadcastTaskStatus(taskId, task.getPlanId(), status.name()); } catch (Exception e) { log.warn("WS broadcast failed: {}", e.getMessage()); }
        
        // #489: 终态统一资源释放（GPU + 节点 + 调度触发）
        if (status == EvaluationTask.TaskStatus.COMPLETED || 
            status == EvaluationTask.TaskStatus.FAILED ||
            status == EvaluationTask.TaskStatus.CANCELLED) {
            try {
                lifecycle.onTaskTerminated(taskId);
                log.info("#489: Lifecycle onTaskTerminated for task {} (status={})", taskId, status);
            } catch (Exception e) {
                log.warn("#489: Lifecycle failed for task {}: {}", taskId, e.getMessage());
            }
        }

        // #490: Plan 进度更新已由 lifecycle.onTaskTerminated 内部的 PlanProgressService 统一处理

        return saved;
    }

    /**
     * 取消任务
     * #401: RUNNING 任务取消时释放 GPU Slot
     */
    @Transactional
    public EvaluationTask cancelTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        // #386: Admin (super_admin/tenant_admin) can cancel any task
        if (!task.getCreatedBy().equals(userId) && !isAdmin(userId)) {
            throw new RuntimeException("No permission to cancel this task");
        }

        if (task.getStatus() == EvaluationTask.TaskStatus.COMPLETED ||
            task.getStatus() == EvaluationTask.TaskStatus.CANCELLED) {
            throw new RuntimeException("Task cannot be cancelled: " + task.getStatus());
        }

        // #489: cancelTask 不需要单独释放 GPU — updateTaskStatus(CANCELLED) 的终态分支会走 lifecycle
        return updateTaskStatus(taskId, EvaluationTask.TaskStatus.CANCELLED, "Cancelled by user");
    }

    /**
     * 重试任务
     */
    @Transactional
    public EvaluationTask retryTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        // #386: Admin (super_admin/tenant_admin) can retry any task
        if (!task.getCreatedBy().equals(userId) && !isAdmin(userId)) {
            throw new RuntimeException("No permission to retry this task");
        }

        if (task.getStatus() != EvaluationTask.TaskStatus.FAILED &&
            task.getStatus() != EvaluationTask.TaskStatus.CANCELLED) {
            throw new RuntimeException("Only failed or cancelled tasks can be retried");
        }

        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setProgress(0);
        task.setStartedAt(null);
        task.setCompletedAt(null);

        EvaluationTask saved = taskRepository.save(task);
        log.info("Retried task: {} (status=QUEUED)", taskId);

        // 事件驱动：重试后立即尝试分发
        try {
            TaskDispatcher dispatcher = applicationContext.getBean(TaskDispatcher.class);
            dispatcher.tryDispatchNext();
        } catch (Exception e) {
            log.debug("Retry dispatch attempt failed: {}", e.getMessage());
        }

        return saved;
    }

    /**
     * 生成任务编号
     */

    /**
     * 克隆任务 (#227) — 基于原任务创建新的 PENDING 副本
     */
    @Transactional
    public EvaluationTask cloneTask(Long taskId, Long userId) {
        EvaluationTask original = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        EvaluationTask clone = new EvaluationTask();
        clone.setTaskNo(generateTaskNo());
        clone.setName(original.getName() + "(\u526F\u672C)");
        clone.setTaskType(original.getTaskType());
        clone.setEvalType(original.getEvalType());
        clone.setStatus(EvaluationTask.TaskStatus.QUEUED);
        clone.setPriority(original.getPriority());
        clone.setEvalConfig(original.getEvalConfig());
        clone.setDatasetIds(original.getDatasetIds());
        clone.setResourceSpec(original.getResourceSpec());
        clone.setCreatedBy(userId);
        clone.setProgress(0);
        clone.setPlanId(original.getPlanId());
        clone.setChipId(original.getChipId());
        clone.setTestSubject(original.getTestSubject());
        clone.setTestItem(original.getTestItem());
        clone.setDimension(original.getDimension());
        clone.setTimeoutSeconds(original.getTimeoutSeconds());

        EvaluationTask saved = taskRepository.save(clone);
        log.info("Cloned task {} -> {} ({})", original.getTaskNo(), saved.getTaskNo(), saved.getName());
        return saved;
    }

    /**
     * #386: Check if user is admin (super_admin or tenant_admin)
     */
    private boolean isAdmin(Long userId) {
        return userRepository.findById(userId)
                .map(user -> {
                    String role = user.getRole();
                    return "super_admin".equals(role) || "tenant_admin".equals(role);
                })
                .orElse(false);
    }

    private String generateTaskNo() {
        return "TASK-" + Instant.now().getEpochSecond() + "-" + 
               String.format("%03d", (int)(Math.random() * 1000));
    }

    /**
     * 暂停任务
     */
    @Transactional
    public EvaluationTask pauseTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        if (task.getStatus() != EvaluationTask.TaskStatus.RUNNING &&
            task.getStatus() != EvaluationTask.TaskStatus.PENDING) {
            throw new RuntimeException("Only running or pending tasks can be paused, current: " + task.getStatus());
        }

        return updateTaskStatus(taskId, EvaluationTask.TaskStatus.PAUSED, "Paused by user");
    }

    /**
     * 恢复任务
     */
    @Transactional
    public EvaluationTask resumeTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        if (task.getStatus() != EvaluationTask.TaskStatus.PAUSED) {
            throw new RuntimeException("Only paused tasks can be resumed, current: " + task.getStatus());
        }

        return updateTaskStatus(taskId, EvaluationTask.TaskStatus.QUEUED, "Resumed by user");
    }


    /**
     * 跳过任务 (#163)
     */
    @Transactional
    public EvaluationTask skipTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        if (task.getStatus() != EvaluationTask.TaskStatus.FAILED &&
            task.getStatus() != EvaluationTask.TaskStatus.PENDING) {
            throw new RuntimeException("Only failed or pending tasks can be skipped");
        }

        task.setStatus(EvaluationTask.TaskStatus.SKIPPED);
        task.setCompletedAt(Instant.now());
        EvaluationTask saved = taskRepository.save(task);
        log.info("Skipped task: {}", taskId);

        // #489: SKIPPED 是终态，走统一资源释放
        lifecycle.onTaskTerminated(taskId);
        return saved;
    }



    /**
     * 删除任务 (#325)
     */
    @Transactional
    public void deleteTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        if (task.getStatus() == EvaluationTask.TaskStatus.RUNNING) {
            throw new RuntimeException("Cannot delete a running task. Please cancel it first.");
        }

        // #489: 删除前释放 GPU（防止孤儿 slot）
        lifecycle.onTaskTerminated(taskId);

        taskRepository.delete(task);
        log.info("Deleted task: {} by user {}", taskId, userId);
    }

    /**
     * 执行任务（将PENDING/QUEUED任务变为RUNNING）(#325)
     */
    @Transactional
    public EvaluationTask executeTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        if (task.getStatus() != EvaluationTask.TaskStatus.PENDING &&
            task.getStatus() != EvaluationTask.TaskStatus.QUEUED) {
            throw new RuntimeException("Only PENDING or QUEUED tasks can be executed, current: " + task.getStatus());
        }

        return updateTaskStatus(taskId, EvaluationTask.TaskStatus.RUNNING, "Executed by user " + userId);
    }

    /**
     * 批量删除任务 (#336)
     * #493: 移除外层 @Transactional，每个删除操作独立事务（deleteTask 本身有 @Transactional）
     * 部分失败不影响其他操作
     */
    public int batchDeleteTasks(java.util.List<Long> taskIds, Long userId) {
        int deleted = 0;
        for (Long taskId : taskIds) {
            try {
                deleteTask(taskId, userId);
                deleted++;
            } catch (Exception e) {
                log.warn("Failed to delete task {}: {}", taskId, e.getMessage());
            }
        }
        return deleted;
    }

    /**
     * 批量取消任务 (#337)
     * #493: 移除外层 @Transactional，每个取消操作独立事务（cancelTask 本身有 @Transactional）
     * 部分失败不影响其他操作
     */
    public int batchCancelTasks(java.util.List<Long> taskIds, Long userId) {
        int cancelled = 0;
        for (Long taskId : taskIds) {
            try {
                cancelTask(taskId, userId);
                cancelled++;
            } catch (Exception e) {
                log.warn("Failed to cancel task {}: {}", taskId, e.getMessage());
            }
        }
        return cancelled;
    }
}
