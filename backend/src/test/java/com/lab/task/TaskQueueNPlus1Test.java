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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * #556: Verify that N+1 query problem is eliminated in TaskQueueController.
 * With 50 queued tasks and 8 nodes, we should NOT see 400+ individual DB calls.
 * Instead: batch findAll() for nodes, findAllById() for RunSpecs.
 */
@ExtendWith(MockitoExtension.class)
class TaskQueueNPlus1Test {

    @Mock private EvaluationTaskService taskService;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private ComputeNodeRepository computeNodeRepository;
    @Mock private GpuSlotService gpuSlotService;
    @Mock private RunSpecRepository runSpecRepository;

    @InjectMocks
    private TaskQueueController controller;

    @Test
    @DisplayName("#556: 50 queued tasks with 8 nodes should NOT trigger N*M individual DB calls")
    void testNoNPlus1With50TasksAnd8Nodes() {
        // Setup: 50 queued tasks, each assigned to different nodes
        int taskCount = 50;
        int nodeCount = 8;
        List<EvaluationTask> tasks = new ArrayList<>();
        Set<Long> runSpecIds = new HashSet<>();
        for (int i = 0; i < taskCount; i++) {
            EvaluationTask task = new EvaluationTask();
            task.setId((long) (i + 1));
            task.setTaskNo("TASK-" + String.format("%03d", i + 1));
            task.setName("Task " + (i + 1));
            task.setStatus(EvaluationTask.TaskStatus.QUEUED);
            task.setEvalType(EvaluationTask.EvalType.MODEL);
            task.setAssignedNodeId((long) (i % nodeCount + 1)); // distribute across nodes
            long runSpecId = (long) (i % 5 + 1); // 5 unique RunSpecs
            task.setRunSpecId(runSpecId);
            runSpecIds.add(runSpecId);
            tasks.add(task);
        }

        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt()).thenReturn(tasks);
        when(taskRepository.findAverageDurationByEvalTypeRaw()).thenReturn(List.of());

        // Setup RunSpecs in batch
        List<RunSpec> runSpecs = new ArrayList<>();
        for (Long id : runSpecIds) {
            RunSpec rs = new RunSpec();
            rs.setId(id);
            rs.setGpuPerNode(2);
            runSpecs.add(rs);
        }
        when(runSpecRepository.findAllById(anyCollection())).thenReturn(runSpecs);

        // Setup 8 nodes
        List<ComputeNode> nodes = new ArrayList<>();
        for (int i = 1; i <= nodeCount; i++) {
            ComputeNode node = new ComputeNode();
            node.setId((long) i);
            node.setName("gpu-node-" + i);
            node.setStatus(ComputeNode.Status.ONLINE);
            nodes.add(node);
        }
        when(computeNodeRepository.findAll()).thenReturn(nodes);
        for (int i = 1; i <= nodeCount; i++) {
            when(gpuSlotService.countFreeSlots((long) i)).thenReturn((long) (i % 3)); // varying free slots
            when(gpuSlotService.countTotalSlots((long) i)).thenReturn(8L);
        }

        // Execute
        ResponseEntity<Map<String, Object>> response = controller.getQueuedTasks();

        // Verify response
        assertEquals(200, response.getStatusCode().value());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> data = (List<Map<String, Object>>) response.getBody().get("data");
        assertEquals(taskCount, data.size());

        // === KEY N+1 ASSERTIONS ===
        // Before fix: computeNodeRepository.findById() would be called once per task per node lookup
        // = potentially 50 * 2 = 100+ individual findById calls
        // After fix: ZERO findById calls, only batch findAll()
        verify(computeNodeRepository, never()).findById(anyLong());

        // Before fix: runSpecRepository.findById() called once per task = 50 calls
        // After fix: single findAllById() call
        verify(runSpecRepository, never()).findById(anyLong());
        verify(runSpecRepository, times(1)).findAllById(anyCollection());

        // computeNodeRepository.findAll() called exactly twice (buildNodeGpuState + buildNodeMap)
        verify(computeNodeRepository, times(2)).findAll();

        // GPU slot service called once per node (in buildNodeGpuState), not once per task
        verify(gpuSlotService, times(nodeCount)).countFreeSlots(anyLong());
        verify(gpuSlotService, times(nodeCount)).countTotalSlots(anyLong());
    }

    @Test
    @DisplayName("#556: getQueueInfo uses DB-level AVG, not loading all completed tasks")
    void testGetQueueInfoUsesDbAvg() {
        when(taskRepository.findQueuedTasksOrderByPriorityAndCreatedAt()).thenReturn(List.of());
        when(taskRepository.findAverageCompletedDurationSeconds()).thenReturn(120.5);
        when(taskRepository.countByStatus(EvaluationTask.TaskStatus.RUNNING)).thenReturn(2L);

        ResponseEntity<Map<String, Object>> response = controller.getQueueInfo();
        assertEquals(200, response.getStatusCode().value());

        // Before fix: findByStatus(COMPLETED) loaded ALL completed tasks into memory
        // After fix: uses findAverageCompletedDurationSeconds() native query
        verify(taskRepository, times(1)).findAverageCompletedDurationSeconds();
        verify(taskRepository, never()).findByStatus(EvaluationTask.TaskStatus.COMPLETED);
    }
}
