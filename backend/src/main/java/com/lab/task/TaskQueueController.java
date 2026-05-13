package com.lab.task;

import com.lab.auth.RequireRole;
import com.lab.auth.Role;
import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 评测任务队列控制器 — 队列信息 / 排队状态 / 停滞任务
 */
@Slf4j
@RestController
@RequestMapping("/tasks")
@RequiredArgsConstructor
public class TaskQueueController {

    private final EvaluationTaskService taskService;
    private final EvaluationTaskRepository taskRepository;
    private final ComputeNodeRepository computeNodeRepository;
    private final GpuSlotService gpuSlotService;
    private final RunSpecRepository runSpecRepository;

    /**
     * #401: GET /tasks/queue-info
     */
    @GetMapping("/queue-info")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getQueueInfo() {
        List<EvaluationTask> queuedTasks = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();

        long avgDurationMs = computeAverageCompletionMs(
                taskRepository.findByStatus(EvaluationTask.TaskStatus.COMPLETED));
        long runningCount = taskRepository.countByStatus(EvaluationTask.TaskStatus.RUNNING);
        int concurrency = Math.max(1, (int) runningCount);

        List<Map<String, Object>> queueInfo = new ArrayList<>();
        for (int i = 0; i < queuedTasks.size(); i++) {
            EvaluationTask task = queuedTasks.get(i);
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("taskId", task.getId());
            info.put("taskNo", task.getTaskNo());
            info.put("position", i + 1);
            info.put("totalQueued", queuedTasks.size());
            info.put("queueReason", task.getQueueReason());
            if (avgDurationMs > 0 && concurrency > 0) {
                long estimatedWaitMs = ((long) (i + 1) / concurrency) * avgDurationMs;
                info.put("estimatedWaitMs", estimatedWaitMs);
                info.put("estimatedWaitMinutes", estimatedWaitMs / 60000);
            }
            queueInfo.add(info);
        }
        return ResponseEntity.ok(TaskResponseHelper.ok(queueInfo));
    }

    /**
     * #481/#486: GET /tasks/queue — compute positions + wait estimates on-the-fly
     * queueReason is recomputed from current GPU state (not stale persisted value).
     * Uses per-evalType average duration from last 7 days (falls back to 10 min).
     */
    @GetMapping("/queue")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getQueuedTasks() {
        List<EvaluationTask> queuedTasks = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();

        // #481: Build evalType -> avg minutes map from recent completions
        Map<String, Double> avgMinutesByType = buildAvgMinutesByType();
        // #486: Pre-fetch node GPU state for fresh queueReason computation
        Map<Long, long[]> nodeGpuState = buildNodeGpuState();

        List<Map<String, Object>> queueData = new ArrayList<>();
        for (int i = 0; i < queuedTasks.size(); i++) {
            EvaluationTask task = queuedTasks.get(i);
            int position = i + 1;
            String evalType = task.getEvalType() != null ? task.getEvalType().name() : null;
            double avgMin = (evalType != null) ? avgMinutesByType.getOrDefault(evalType, 10.0) : 10.0;
            int estimatedWait = (int) Math.ceil(position * avgMin);

            // #486: Compute fresh queueReason from current GPU state
            String freshReason = computeFreshQueueReason(task, nodeGpuState);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", task.getId());
            item.put("taskNo", task.getTaskNo());
            item.put("name", task.getName());
            item.put("evalType", evalType);
            item.put("status", task.getStatus() != null ? task.getStatus().name() : null);
            item.put("priority", task.getPriority() != null ? task.getPriority().name() : null);
            item.put("queuePosition", position);
            item.put("estimatedWaitMinutes", estimatedWait);
            item.put("queueReason", freshReason != null ? freshReason : task.getQueueReason());
            item.put("allocatedGpuIndices", task.getAllocatedGpuIndices());
            item.put("createdAt", task.getCreatedAt());
            queueData.add(item);
        }

        return ResponseEntity.ok(TaskResponseHelper.ok(queueData, Map.of("total", queueData.size())));
    }

    /**
     * #520: GET /tasks/queue-status — queue summary with user's tasks
     */
    @GetMapping("/queue-status")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getQueueStatus() {
        Long userId = EvaluationTaskController.getCurrentUserId();
        List<EvaluationTask> queuedTasks = taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt();

        Map<String, Double> avgMinutesByType = buildAvgMinutesByType();
        List<Map<String, Object>> myTasks = new ArrayList<>();
        List<Map<String, Object>> allTasks = new ArrayList<>();
        for (int i = 0; i < queuedTasks.size(); i++) {
            EvaluationTask task = queuedTasks.get(i);
            int position = i + 1;
            String evalType = task.getEvalType() != null ? task.getEvalType().name() : null;
            double avgMin = (evalType != null) ? avgMinutesByType.getOrDefault(evalType, 10.0) : 10.0;
            int estimatedWait = (int) Math.ceil(position * avgMin);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("taskId", task.getId());
            item.put("taskNo", task.getTaskNo());
            item.put("name", task.getName());
            item.put("queuePosition", position);
            item.put("estimatedWaitMinutes", estimatedWait);
            item.put("priority", task.getPriority() != null ? task.getPriority().name() : null);
            item.put("createdBy", task.getCreatedBy());
            item.put("createdAt", task.getCreatedAt());
            allTasks.add(item);

            if (task.getCreatedBy() != null && task.getCreatedBy().equals(userId)) {
                myTasks.add(item);
            }
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalQueued", queuedTasks.size());
        data.put("myQueuedCount", myTasks.size());
        data.put("myQueuedTasks", myTasks);
        data.put("allQueuedTasks", allTasks);
        return ResponseEntity.ok(TaskResponseHelper.ok(data));
    }

    /**
     * #520: PATCH /tasks/{taskId}/cancel — cancel QUEUED/PENDING task only
     */
    @PatchMapping("/{taskId}/cancel")
    @RequireRole(Role.ENGINEER)
    public ResponseEntity<Map<String, Object>> patchCancelTask(@PathVariable Long taskId) {
        Long userId = EvaluationTaskController.getCurrentUserId();
        try {
            EvaluationTask task = taskRepository.findById(taskId)
                    .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
            if (task.getStatus() != EvaluationTask.TaskStatus.QUEUED
                    && task.getStatus() != EvaluationTask.TaskStatus.PENDING) {
                throw new RuntimeException("Only QUEUED or PENDING tasks can be cancelled via PATCH, current: " + task.getStatus());
            }
            EvaluationTask cancelled = taskService.cancelTask(taskId, userId);
            return ResponseEntity.ok(TaskResponseHelper.ok(cancelled));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(TaskResponseHelper.error(1001, e.getMessage()));
        }
    }

    /**
     * #519: GET /tasks/stalled — list stalled (warning) tasks
     */
    @GetMapping("/stalled")
    @RequireRole(Role.VIEWER)
    public ResponseEntity<Map<String, Object>> getStalledTasks() {
        Instant threshold = Instant.now().minus(5, ChronoUnit.MINUTES);
        List<EvaluationTask> stalledTasks = taskRepository.findStalledRunningTasks(threshold);
        for (EvaluationTask task : stalledTasks) {
            TaskWarningHelper.enrichWithWarning(task);
        }
        return ResponseEntity.ok(TaskResponseHelper.ok(stalledTasks, Map.of("total", stalledTasks.size())));
    }

    // ── 私有方法 ──
    private Map<String, Double> buildAvgMinutesByType() {
        Map<String, Double> avgMinutesByType = new HashMap<>();
        try {
            List<Object[]> rawAvgs = taskRepository.findAverageDurationByEvalTypeRaw();
            for (Object[] row : rawAvgs) {
                String evalType = (String) row[0];
                double avgSec = ((Number) row[1]).doubleValue();
                avgMinutesByType.put(evalType, avgSec / 60.0);
            }
        } catch (Exception e) {
            log.debug("Failed to compute per-type avg duration: {}", e.getMessage());
        }
        return avgMinutesByType;
    }
    private Map<Long, long[]> buildNodeGpuState() {
        Map<Long, long[]> nodeGpuState = new HashMap<>();
        try {
            List<ComputeNode> allNodes = computeNodeRepository.findAll();
            for (ComputeNode node : allNodes) {
                long free = gpuSlotService.countFreeSlots(node.getId());
                long total = gpuSlotService.countTotalSlots(node.getId());
                if (total > 0) {
                    nodeGpuState.put(node.getId(), new long[]{free, total});
                }
            }
        } catch (Exception e) {
            log.debug("Failed to pre-fetch GPU state for queue reasons: {}", e.getMessage());
        }
        return nodeGpuState;
    }
    /**
     * #486: Compute a fresh queueReason based on current GPU resource state.
     * Returns null if we can't determine a meaningful reason (caller falls back to persisted).
     */
    String computeFreshQueueReason(EvaluationTask task, Map<Long, long[]> nodeGpuState) {
        try {
            int gpuNeeded = 1;
            RunSpec runSpec = resolveRunSpecForTask(task);
            if (runSpec != null && runSpec.getGpuPerNode() != null && runSpec.getGpuPerNode() > 0) {
                gpuNeeded = runSpec.getGpuPerNode();
            }

            if (task.getAssignedNodeId() != null) {
                long[] state = nodeGpuState.get(task.getAssignedNodeId());
                if (state != null) {
                    long free = state[0], total = state[1];
                    ComputeNode node = computeNodeRepository.findById(task.getAssignedNodeId()).orElse(null);
                    String nodeName = node != null ? node.getName() : "ID=" + task.getAssignedNodeId();
                    if (free < gpuNeeded) {
                        return String.format("等待 GPU 资源释放（节点 %s: %d/%d 空闲，需要 %d）",
                                nodeName, free, total, gpuNeeded);
                    } else {
                        return String.format("GPU 资源充足（节点 %s: %d/%d 空闲，需要 %d），等待调度",
                                nodeName, free, total, gpuNeeded);
                    }
                }
            }

            if (!nodeGpuState.isEmpty()) {
                long bestFree = 0, bestTotal = 0;
                String bestNodeName = null;
                for (Map.Entry<Long, long[]> entry : nodeGpuState.entrySet()) {
                    long free = entry.getValue()[0], total = entry.getValue()[1];
                    if (free > bestFree) {
                        bestFree = free;
                        bestTotal = total;
                        ComputeNode node = computeNodeRepository.findById(entry.getKey()).orElse(null);
                        bestNodeName = node != null ? node.getName() : "ID=" + entry.getKey();
                    }
                }
                if (bestFree < gpuNeeded) {
                    return String.format("等待 GPU 资源释放（最优节点 %s: %d/%d 空闲，需要 %d）",
                            bestNodeName, bestFree, bestTotal, gpuNeeded);
                } else {
                    return String.format("GPU 资源充足（%s: %d/%d 空闲，需要 %d），等待调度",
                            bestNodeName, bestFree, bestTotal, gpuNeeded);
                }
            }
        } catch (Exception e) {
            log.debug("Failed to compute fresh queue reason for task {}: {}", task.getTaskNo(), e.getMessage());
        }
        return null;
    }

    /**
     * #486: Resolve RunSpec for a task
     */
    private RunSpec resolveRunSpecForTask(EvaluationTask task) {
        if (task.getRunSpecId() != null) {
            return runSpecRepository.findById(task.getRunSpecId()).orElse(null);
        }
        if (task.getRunSpecCode() != null && !task.getRunSpecCode().isBlank()) {
            return runSpecRepository.findByCode(task.getRunSpecCode()).orElse(null);
        }
        return null;
    }

    private long computeAverageCompletionMs(List<EvaluationTask> completed) {
        if (completed.isEmpty()) return 0;
        long totalMs = 0;
        int count = 0;
        for (EvaluationTask t : completed) {
            if (t.getStartedAt() != null && t.getCompletedAt() != null) {
                totalMs += Duration.between(t.getStartedAt(), t.getCompletedAt()).toMillis();
                count++;
                if (count >= 20) break;
            }
        }
        return count > 0 ? totalMs / count : 0;
    }
}
