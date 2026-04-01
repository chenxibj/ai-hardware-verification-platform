package com.lab.scheduler;

import com.lab.alert.Alert;
import com.lab.alert.AlertRepository;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j @Service @RequiredArgsConstructor
public class TaskSchedulerService {
    private final EvaluationTaskRepository taskRepo;
    private final AlertRepository alertRepo;
    private static final int MAX_CONCURRENT = 5;

    /** 每30秒检查排队任务，分配执行 */
    @Scheduled(fixedRate = 30000)
    public void scheduleQueuedTasks() {
        long running = taskRepo.countByStatus("RUNNING");
        if (running >= MAX_CONCURRENT) return;
        
        int slots = (int)(MAX_CONCURRENT - running);
        // 按优先级排序：HIGH > MEDIUM > LOW，同优先级按创建时间
        List<EvaluationTask> pending = taskRepo.findPendingTasksOrderByPriority();
        
        for (int i = 0; i < Math.min(slots, pending.size()); i++) {
            EvaluationTask task = pending.get(i);
            task.setStatus("RUNNING");
            task.setStartedAt(Instant.now());
            taskRepo.save(task);
            log.info("Task {} scheduled for execution", task.getTaskNo());
        }
    }

    /** 每分钟检查超时任务 */
    @Scheduled(fixedRate = 60000)
    public void checkTimeoutTasks() {
        List<EvaluationTask> running = taskRepo.findByStatus("RUNNING");
        for (EvaluationTask task : running) {
            if (task.getStartedAt() == null) continue;
            int timeout = task.getConfig() != null && task.getConfig().contains("timeoutMinutes") ? 30 : 30; // default 30 min
            if (task.getStartedAt().plus(timeout, ChronoUnit.MINUTES).isBefore(Instant.now())) {
                task.setStatus("FAILED");
                task.setErrorMessage("Task timed out after " + timeout + " minutes");
                task.setCompletedAt(Instant.now());
                taskRepo.save(task);
                // Create alert
                Alert alert = new Alert();
                alert.setAlertType("TASK_TIMEOUT");
                alert.setSeverity("WARNING");
                alert.setTitle("任务超时: " + task.getTaskNo());
                alert.setContent("任务 " + task.getName() + " 执行超过 " + timeout + " 分钟，已自动终止。");
                alert.setTaskId(task.getId());
                alert.setUserId(task.getCreatedBy());
                alertRepo.save(alert);
                log.warn("Task {} timed out", task.getTaskNo());
            }
        }
    }
}
