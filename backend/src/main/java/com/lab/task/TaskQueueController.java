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
import java.util.stream.Collectors;

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

        // #556: Use DB-level AVG instead of loading all completed tasks into memory
        Double avgSec = taskRepository.findAverageCompletedDurationSeconds();
        long avgDurationMs = (avgSec != null) ? (long) (avgSec * 1000) : 0;
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
        // #556: Pre-load nodes and runSpecs to eliminate N+1 queries
        Map<Long, ComputeNode> nodeMap = buildNodeMap();
        Map<Long, RunSpec> runSpecMap = buildRunSpecMap(queuedTasks);

        List<Map<String, Object>> queueData = new ArrayList<>();
        for (int i = 0; i < queuedTasks.size(); i++) {
            EvaluationTask task = queuedTasks.get(i);
            int position = i + 1;
            String evalType = task.getEvalType() != null ? task.getEvalType().name() : null;
            double avgMin = (evalType != null) ? avgMinutesByType.getOrDefault(evalType, 10.0) : 10.0;
            int estimatedWait = (int) Math.ceil(position * avgMin);

            // #486/#556: Compute fresh queueReason from current GPU state (batch-friendly)
            String freshReason = computeFreshQueueReason(task, nodeGpuState, nodeMap, runSpecMap);

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
     * #556: Pre-load all ComputeNodes into a Map to avoid N+1 queries in computeFreshQueueReason
     */
    private Map<Long, ComputeNode> buildNodeMap() {
        Map<Long, ComputeNode> nodeMap = new HashMap<>();
        try {
            List<ComputeNode> allNodes = computeNodeRepository.findAll();
            for (ComputeNode node : allNodes) {
                nodeMap.put(node.getId(), node);
            }
        } catch (Exception e) {
            log.debug("Failed to pre-fetch nodes: {}", e.getMessage());
        }
        return nodeMap;
    }

    /**
     * #556: Pre-load RunSpecs for a batch of tasks to avoid N+1 queries
     */
    private Map<Long, RunSpec> buildRunSpecMap(List<EvaluationTask> tasks) {
        Map<Long, RunSpec> runSpecMap = new HashMap<>();
        try {
            Set<Long> runSpecIds = new HashSet<>();
            Set<String> runSpecCodes = new HashSet<>();
            for (EvaluationTask task : tasks) {
                if (task.getRunSpecId() != null) {
                    runSpecIds.add(task.getRunSpecId());
                } else if (task.getRunSpecCode() != null && !task.getRunSpecCode().isBlank()) {
                    runSpecCodes.add(task.getRunSpecCode());
                }
            }
            if (!runSpecIds.isEmpty()) {
                List<RunSpec> specs = runSpecRepository.findAllById(runSpecIds);
                for (RunSpec spec : specs) {
                    runSpecMap.put(spec.getId(), spec);
                }
            }
            if (!runSpecCodes.isEmpty()) {
                List<RunSpec> specs = runSpecRepository.findByCodeIn(runSpecCodes);
                for (RunSpec spec : specs) {
                    runSpecMap.put(spec.getId(), spec);
                }
            }
        } catch (Exception e) {
            log.debug("Failed to pre-fetch RunSpecs: {}", e.getMessage());
        }
        return runSpecMap;
    }
    /**
     * #486/#556: Compute a fresh queueReason based on current GPU resource state.
     * Returns null if we can't determine a meaningful reason (caller falls back to persisted).
     * #556: Now accepts pre-loaded nodeMap and runSpecMap to eliminate N+1 queries.
     */
    String computeFreshQueueReason(EvaluationTask task, Map<Long, long[]> nodeGpuState,
                                   Map<Long, ComputeNode> nodeMap, Map<Long, RunSpec> runSpecMap) {
        try {
            int gpuNeeded = 1;
            RunSpec runSpec = resolveRunSpecForTask(task, runSpecMap);
            if (runSpec != null && runSpec.getGpuPerNode() != null && runSpec.getGpuPerNode() > 0) {
                gpuNeeded = runSpec.getGpuPerNode();
            }

            if (task.getAssignedNodeId() != null) {
                long[] state = nodeGpuState.get(task.getAssignedNodeId());
                if (state != null) {
                    long free = state[0], total = state[1];
                    ComputeNode node = nodeMap.get(task.getAssignedNodeId());
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
                        ComputeNode node = nodeMap.get(entry.getKey());
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
     * @deprecated Use {@link #computeFreshQueueReason(EvaluationTask, Map, Map, Map)} instead.
     * Kept for backward compatibility with tests.
     */
    String computeFreshQueueReason(EvaluationTask task, Map<Long, long[]> nodeGpuState) {
        Map<Long, ComputeNode> nodeMap = buildNodeMap();
        Map<Long, RunSpec> runSpecMap = buildRunSpecMap(List.of(task));
        return computeFreshQueueReason(task, nodeGpuState, nodeMap, runSpecMap);
    }

    /**
     * #486/#556: Resolve RunSpec for a task using pre-loaded map (batch-friendly)
     */
    private RunSpec resolveRunSpecForTask(EvaluationTask task, Map<Long, RunSpec> runSpecMap) {
        if (task.getRunSpecId() != null) {
            return runSpecMap.get(task.getRunSpecId());
        }
        if (task.getRunSpecCode() != null && !task.getRunSpecCode().isBlank()) {
            // Search by code in pre-loaded map
            for (RunSpec spec : runSpecMap.values()) {
                if (task.getRunSpecCode().equals(spec.getCode())) {
                    return spec;
                }
            }
        }
        return null;
    }

    /**
     * @deprecated Use {@link #resolveRunSpecForTask(EvaluationTask, Map)} instead
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
        // #556: This method is kept for backward compatibility but prefer
        // taskRepository.findAverageCompletedDurationSeconds() for production use.
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
