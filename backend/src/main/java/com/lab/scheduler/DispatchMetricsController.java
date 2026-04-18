package com.lab.scheduler;

import com.lab.common.ApiResponse;
import com.lab.gpu.GpuSlotRepository;
import com.lab.gpu.GpuSlotStatus;
import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * #493: 调度指标 API
 * GET /api/metrics/dispatch — 返回队列深度、GPU 利用率、过去 1h 吞吐量、平均调度延迟
 */
@RestController
@RequestMapping("/metrics/dispatch")
@RequiredArgsConstructor
public class DispatchMetricsController {

    private final EvaluationTaskRepository taskRepository;
    private final GpuSlotRepository gpuSlotRepository;

    @GetMapping
    public ApiResponse<Map<String, Object>> getDispatchMetrics() {
        Map<String, Object> metrics = new LinkedHashMap<>();

        // 1. 队列深度：QUEUED + PENDING 状态的任务数
        long queuedCount = taskRepository.countByStatus(EvaluationTask.TaskStatus.QUEUED);
        long pendingCount = taskRepository.countByStatus(EvaluationTask.TaskStatus.PENDING);
        metrics.put("queueDepth", queuedCount + pendingCount);
        metrics.put("queuedTasks", queuedCount);
        metrics.put("pendingTasks", pendingCount);

        // 2. GPU 利用率
        long totalSlots = gpuSlotRepository.count();
        long allocatedSlots = gpuSlotRepository.findAllocatedSlots().size();
        double gpuUtilizationPercent = totalSlots > 0
                ? Math.round(allocatedSlots * 1000.0 / totalSlots) / 10.0
                : 0.0;
        metrics.put("gpuTotalSlots", totalSlots);
        metrics.put("gpuAllocatedSlots", allocatedSlots);
        metrics.put("gpuUtilizationPercent", gpuUtilizationPercent);

        // 3. 过去 1h 吞吐量（完成的任务数）
        Instant oneHourAgo = Instant.now().minus(1, ChronoUnit.HOURS);
        long completedLastHour = taskRepository.countCompletedSince(oneHourAgo);
        metrics.put("throughputLastHour", completedLastHour);

        // 4. 平均调度延迟（从创建到开始执行的平均秒数，过去 1h）
        Double avgDispatchDelay = taskRepository.findAverageDispatchDelaySecondsLastHour();
        metrics.put("avgDispatchDelaySeconds", avgDispatchDelay != null ? Math.round(avgDispatchDelay * 10.0) / 10.0 : null);

        // 5. 当前运行中的任务数
        long runningCount = taskRepository.countByStatus(EvaluationTask.TaskStatus.RUNNING);
        long dispatchedCount = taskRepository.countByStatus(EvaluationTask.TaskStatus.DISPATCHED);
        metrics.put("runningTasks", runningCount);
        metrics.put("dispatchedTasks", dispatchedCount);

        return ApiResponse.ok(metrics);
    }
}
