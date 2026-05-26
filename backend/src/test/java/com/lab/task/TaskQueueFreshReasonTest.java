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
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.*;

/**
 * #486/#556: Test that /tasks/queue returns freshly-computed queueReason
 * reflecting current GPU resource state, not stale persisted values.
 * #556: Updated to verify batch-loading (no N+1 queries).
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
    @DisplayName("#486/#556: /tasks/queue returns fresh queueReason based on current GPU state (batch loaded)")
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

        // Setup RunSpec: needs 4 GPUs - #556: now uses findAllById (batch)
        RunSpec runSpec = new RunSpec();
        runSpec.setId(10L);
        runSpec.setGpuPerNode(4);
        when(runSpecRepository.findAllById(anyCollection())).thenReturn(List.of(runSpec));

        // Setup node with GPU state: NOW has 6/8 free (resources were released)
        ComputeNode node = new ComputeNode();
        node.setId(100L);
        node.setName("gpu-l40s-01");
        node.setStatus(ComputeNode.Status.ONLINE);
        when(computeNodeRepository.findAll()).thenReturn(List.of(node));
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

        // #556: Verify NO individual findById calls on ComputeNodeRepository (N+1 eliminated)
        verify(computeNodeRepository, never()).findById(anyLong());
    }

    @Test
    @DisplayName("#486/#556: /tasks/queue shows insufficient GPU when not enough free")
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
        runSpec.setId(20L);
        runSpec.setGpuPerNode(8); // needs ALL 8 GPUs
        when(runSpecRepository.findAllById(anyCollection())).thenReturn(List.of(runSpec));

        ComputeNode node = new ComputeNode();
        node.setId(100L);
        node.setName("gpu-l40s-01");
        node.setStatus(ComputeNode.Status.ONLINE);
        when(computeNodeRepository.findAll()).thenReturn(List.of(node));
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

        // #556: Verify no N+1
        verify(computeNodeRepository, never()).findById(anyLong());
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

    @Test
    @DisplayName("#556: Multiple tasks batch-load RunSpecs and nodes - no N+1")
    void testMultipleTasksBatchLoadNoNPlus1() {
        // Setup: 3 queued tasks with different runSpecIds
        List<EvaluationTask> tasks = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            EvaluationTask task = new EvaluationTask();
            task.setId((long) i);
            task.setTaskNo("TASK-00" + i);
            task.setName("Task " + i);
            task.setStatus(EvaluationTask.TaskStatus.QUEUED);
            task.setEvalType(EvaluationTask.EvalType.MODEL);
            task.setRunSpecId((long) (i * 10));
            tasks.add(task);
        }

        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt()).thenReturn(tasks);
        when(taskRepository.findAverageDurationByEvalTypeRaw()).thenReturn(List.of());

        // Setup RunSpecs batch
        List<RunSpec> runSpecs = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            RunSpec rs = new RunSpec();
            rs.setId((long) (i * 10));
            rs.setGpuPerNode(2);
            runSpecs.add(rs);
        }
        when(runSpecRepository.findAllById(anyCollection())).thenReturn(runSpecs);

        // Setup 2 nodes
        ComputeNode node1 = new ComputeNode();
        node1.setId(100L);
        node1.setName("node-1");
        ComputeNode node2 = new ComputeNode();
        node2.setId(200L);
        node2.setName("node-2");
        when(computeNodeRepository.findAll()).thenReturn(List.of(node1, node2));
        when(gpuSlotService.countFreeSlots(100L)).thenReturn(4L);
        when(gpuSlotService.countTotalSlots(100L)).thenReturn(8L);
        when(gpuSlotService.countFreeSlots(200L)).thenReturn(2L);
        when(gpuSlotService.countTotalSlots(200L)).thenReturn(4L);

        // Execute
        ResponseEntity<Map<String, Object>> response = controller.getQueuedTasks();

        // Verify response has all 3 tasks
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> data = (List<Map<String, Object>>) response.getBody().get("data");
        assertEquals(3, data.size());

        // #556: KEY ASSERTION - verify batch loading happened:
        // computeNodeRepository.findAll() called exactly twice (once in buildNodeGpuState, once in buildNodeMap)
        verify(computeNodeRepository, times(2)).findAll();
        // NO individual findById calls (N+1 eliminated)
        verify(computeNodeRepository, never()).findById(anyLong());
        // RunSpec loaded in batch, not individually
        verify(runSpecRepository, times(1)).findAllById(anyCollection());
        verify(runSpecRepository, never()).findById(anyLong());
    }
}
