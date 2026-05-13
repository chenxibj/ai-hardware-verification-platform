package com.lab.task;

import com.lab.gpu.GpuSlotService;
import com.lab.node.ComputeNode;
import com.lab.node.ComputeNodeRepository;
import com.lab.runspec.RunSpec;
import com.lab.runspec.RunSpecRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #486: Test that /tasks/queue returns freshly-computed queueReason
 * reflecting current GPU resource state, not stale persisted values.
 */
@ExtendWith(MockitoExtension.class)
class TaskQueueFreshReasonTest {

    @Mock private EvaluationTaskService taskService;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private ComputeNodeRepository computeNodeRepository;
    @Mock private GpuSlotService gpuSlotService;
    @Mock private RunSpecRepository runSpecRepository;

    @InjectMocks
    private TaskQueueController controller;

    @Test
    @DisplayName("#486: /tasks/queue returns fresh queueReason based on current GPU state")
    void testQueueReturnsFreshQueueReason() {
        // Setup: a queued task with a STALE queueReason persisted in DB
        EvaluationTask task = new EvaluationTask();
        task.setId(1L);
        task.setTaskNo("TASK-001");
        task.setName("Test inference");
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setEvalType(EvaluationTask.EvalType.MODEL);
        task.setQueueReason("等待 GPU 资源释放（节点 gpu-l40s-01: 0/8 空闲，需要 4）");  // STALE
        task.setRunSpecId(10L);

        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt())
                .thenReturn(List.of(task));
        when(taskRepository.findAverageDurationByEvalTypeRaw())
                .thenReturn(List.of());

        // Setup RunSpec: needs 4 GPUs
        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(4);
        when(runSpecRepository.findById(10L)).thenReturn(Optional.of(runSpec));

        // Setup node with GPU state: NOW has 6/8 free (resources were released)
        ComputeNode node = new ComputeNode();
        node.setId(100L);
        node.setName("gpu-l40s-01");
        node.setStatus(ComputeNode.Status.ONLINE);
        when(computeNodeRepository.findAll()).thenReturn(List.of(node));
        when(computeNodeRepository.findById(100L)).thenReturn(Optional.of(node));
        when(gpuSlotService.countFreeSlots(100L)).thenReturn(6L);
        when(gpuSlotService.countTotalSlots(100L)).thenReturn(8L);

        // Execute
        ResponseEntity<Map<String, Object>> response = controller.getQueuedTasks();

        // Verify
        assertEquals(200, response.getStatusCode().value());
        Map<String, Object> body = response.getBody();
        assertNotNull(body);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> data = (List<Map<String, Object>>) body.get("data");
        assertEquals(1, data.size());

        String queueReason = (String) data.get(0).get("queueReason");
        // Should reflect CURRENT state (6/8 free, enough for 4), not stale (0/8)
        assertNotNull(queueReason);
        assertTrue(queueReason.contains("6/8"), 
            "queueReason should reflect current GPU state (6/8 free), got: " + queueReason);
        assertTrue(queueReason.contains("充足") || queueReason.contains("等待调度"),
            "With 6 free and 4 needed, should indicate resources are sufficient, got: " + queueReason);
        assertFalse(queueReason.contains("0/8"),
            "queueReason should NOT contain stale '0/8' value, got: " + queueReason);
    }

    @Test
    @DisplayName("#486: /tasks/queue shows insufficient GPU when not enough free")
    void testQueueShowsInsufficientGpu() {
        EvaluationTask task = new EvaluationTask();
        task.setId(2L);
        task.setTaskNo("TASK-002");
        task.setName("Large training");
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setEvalType(EvaluationTask.EvalType.TRAINING);
        task.setQueueReason("old stale reason");
        task.setRunSpecId(20L);

        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt())
                .thenReturn(List.of(task));
        when(taskRepository.findAverageDurationByEvalTypeRaw())
                .thenReturn(List.of());

        RunSpec runSpec = new RunSpec();
        runSpec.setGpuPerNode(8); // needs ALL 8 GPUs
        when(runSpecRepository.findById(20L)).thenReturn(Optional.of(runSpec));

        ComputeNode node = new ComputeNode();
        node.setId(100L);
        node.setName("gpu-l40s-01");
        node.setStatus(ComputeNode.Status.ONLINE);
        when(computeNodeRepository.findAll()).thenReturn(List.of(node));
        when(computeNodeRepository.findById(100L)).thenReturn(Optional.of(node));
        when(gpuSlotService.countFreeSlots(100L)).thenReturn(3L);
        when(gpuSlotService.countTotalSlots(100L)).thenReturn(8L);

        ResponseEntity<Map<String, Object>> response = controller.getQueuedTasks();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> data = (List<Map<String, Object>>) response.getBody().get("data");
        String queueReason = (String) data.get(0).get("queueReason");
        assertNotNull(queueReason);
        assertTrue(queueReason.contains("3/8"),
            "Should show current free count, got: " + queueReason);
        assertTrue(queueReason.contains("8") && queueReason.contains("释放"),
            "Should indicate waiting for resources, got: " + queueReason);
    }

    @Test
    @DisplayName("#486: Falls back to persisted queueReason when no GPU nodes exist")
    void testFallsBackToPersistedWhenNoGpuNodes() {
        EvaluationTask task = new EvaluationTask();
        task.setId(3L);
        task.setTaskNo("TASK-003");
        task.setName("CPU task");
        task.setStatus(EvaluationTask.TaskStatus.QUEUED);
        task.setEvalType(EvaluationTask.EvalType.OPERATOR);
        task.setQueueReason("等待节点 cpu-node-01 上线（当前状态: OFFLINE）");

        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt())
                .thenReturn(List.of(task));
        when(taskRepository.findAverageDurationByEvalTypeRaw())
                .thenReturn(List.of());

        // No GPU nodes at all (all nodes have 0 total slots)
        ComputeNode node = new ComputeNode();
        node.setId(200L);
        node.setName("cpu-node-01");
        when(computeNodeRepository.findAll()).thenReturn(List.of(node));
        when(gpuSlotService.countFreeSlots(200L)).thenReturn(0L);
        when(gpuSlotService.countTotalSlots(200L)).thenReturn(0L);

        ResponseEntity<Map<String, Object>> response = controller.getQueuedTasks();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> data = (List<Map<String, Object>>) response.getBody().get("data");
        String queueReason = (String) data.get(0).get("queueReason");
        // Should fall back to persisted reason since there are no GPU nodes
        assertEquals("等待节点 cpu-node-01 上线（当前状态: OFFLINE）", queueReason);
    }
}
