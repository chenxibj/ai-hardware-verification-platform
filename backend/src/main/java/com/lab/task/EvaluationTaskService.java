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
import java.util.Optional;
import com.lab.config.TaskLogWebSocketHandler;

/**
 * 评测任务服务
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EvaluationTaskService {

    private final EvaluationTaskRepository taskRepository;
    private final EvaluationPlanRepository planRepository;
    private final TaskLogWebSocketHandler webSocketHandler;

    /**
     * 创建评测任务
     */
    @Transactional
    public EvaluationTask createTask(CreateTaskRequest request, Long userId) {
        EvaluationTask task = new EvaluationTask();
        task.setTaskNo(generateTaskNo());
        task.setName(request.getName() != null ? request.getName() : "Task-" + task.getTaskNo());
        task.setTaskType(request.getTaskType());
        task.setEvalType(request.getEvalType());
        task.setStatus(EvaluationTask.TaskStatus.PENDING);
        task.setPriority(request.getPriority());
        task.setEvalConfig(request.getEvalConfig());
        task.setDatasetIds(request.getDatasetIds());
        task.setResourceSpec(request.getResourceSpec());
        task.setCreatedBy(userId);
        task.setProgress(0);

        EvaluationTask saved = taskRepository.save(task);
        log.info("Created task: {}", saved.getTaskNo());
        return saved;
    }

    /**
     * 查询任务列表
     */
    @Transactional(readOnly = true)
    public Page<EvaluationTask> listTasks(Long userId, Long planId, EvaluationTask.TaskStatus status, Pageable pageable) {
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
        } else if (status == EvaluationTask.TaskStatus.COMPLETED || 
                   status == EvaluationTask.TaskStatus.FAILED || 
                   status == EvaluationTask.TaskStatus.CANCELLED) {
            task.setCompletedAt(Instant.now());
            task.setProgress(100);
        }

        EvaluationTask saved = taskRepository.save(task);
        log.info("Updated task {} status from {} to {}", taskId, oldStatus, status);
        // #229: Broadcast status change via WebSocket
        try { webSocketHandler.broadcastTaskStatus(taskId, status.name()); } catch (Exception e) { log.warn("WS broadcast failed: {}", e.getMessage()); }
        return saved;
    }

    /**
     * 取消任务
     */
    @Transactional
    public EvaluationTask cancelTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        if (!task.getCreatedBy().equals(userId)) {
            throw new RuntimeException("No permission to cancel this task");
        }

        if (task.getStatus() == EvaluationTask.TaskStatus.COMPLETED ||
            task.getStatus() == EvaluationTask.TaskStatus.CANCELLED) {
            throw new RuntimeException("Task cannot be cancelled: " + task.getStatus());
        }

        return updateTaskStatus(taskId, EvaluationTask.TaskStatus.CANCELLED, "Cancelled by user");
    }

    /**
     * 重试任务
     */
    @Transactional
    public EvaluationTask retryTask(Long taskId, Long userId) {
        EvaluationTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        
        if (!task.getCreatedBy().equals(userId)) {
            throw new RuntimeException("No permission to retry this task");
        }

        if (task.getStatus() != EvaluationTask.TaskStatus.FAILED &&
            task.getStatus() != EvaluationTask.TaskStatus.CANCELLED) {
            throw new RuntimeException("Only failed or cancelled tasks can be retried");
        }

        task.setStatus(EvaluationTask.TaskStatus.PENDING);
        task.setProgress(0);
        task.setStartedAt(null);
        task.setCompletedAt(null);

        EvaluationTask saved = taskRepository.save(task);
        log.info("Retried task: {}", taskId);
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
        clone.setStatus(EvaluationTask.TaskStatus.PENDING);
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

        return updateTaskStatus(taskId, EvaluationTask.TaskStatus.PENDING, "Resumed by user");
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

        // 更新计划进度
        if (task.getPlanId() != null) {
            updatePlanProgressAfterSkip(task.getPlanId());
        }
        return saved;
    }

    private void updatePlanProgressAfterSkip(Long planId) {
        EvaluationPlan plan = planRepository.findById(planId).orElse(null);
        if (plan == null) return;
        List<EvaluationTask> tasks = taskRepository.findByPlanId(planId);
        int total = tasks.size();
        long done = tasks.stream()
                .filter(t -> t.getStatus() == EvaluationTask.TaskStatus.COMPLETED ||
                             t.getStatus() == EvaluationTask.TaskStatus.FAILED ||
                             t.getStatus() == EvaluationTask.TaskStatus.SKIPPED)
                .count();
        plan.setCompletedTasks((int) done);
        plan.setProgress(total > 0 ? (int) (done * 100 / total) : 0);
        planRepository.save(plan);
    }
}
