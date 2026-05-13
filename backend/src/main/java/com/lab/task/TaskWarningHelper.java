package com.lab.task;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * #519: 任务停滞警告计算工具。
 * 从 EvaluationTaskController 抽取的 enrichWithWarning 逻辑，
 * 供 TaskQueryController 和 TaskQueueController 共用。
 */
final class TaskWarningHelper {

    private TaskWarningHelper() {}

    /**
     * 为 RUNNING 状态的任务填充停滞警告信息（warningMessage / isStalled）。
     * 阈值：5 分钟无进度更新。
     */
    static void enrichWithWarning(EvaluationTask task) {
        if (task.getStatus() != EvaluationTask.TaskStatus.RUNNING) return;
        Instant threshold = Instant.now().minus(5, ChronoUnit.MINUTES);
        Instant lastUpdate = task.getLastProgressUpdateAt() != null
                ? task.getLastProgressUpdateAt()
                : task.getStartedAt();
        if (lastUpdate != null && lastUpdate.isBefore(threshold)) {
            long stallMinutes = Duration.between(lastUpdate, Instant.now()).toMinutes();
            task.setWarningMessage(String.format("任务已卡顿 %d 分钟，进度无更新", stallMinutes));
            task.setIsStalled(true);
        }
    }
}
