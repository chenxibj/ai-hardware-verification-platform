package com.lab.gpu;

import com.lab.task.EvaluationTask;
import com.lab.task.EvaluationTaskRepository;
import com.lab.task.TaskDispatcher;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * #499: Orphan GPU slot reclaim — allocated_task_id points to terminal task
 */
@ExtendWith(MockitoExtension.class)
class GpuSlotOrphanReclaimTest {

    @Mock private GpuSlotRepository gpuSlotRepository;
    @Mock private EvaluationTaskRepository taskRepository;
    @Mock private TaskDispatcher taskDispatcher;
    @Mock private EntityManager entityManager;

    @InjectMocks
    private GpuSlotService gpuSlotService;

    @org.junit.jupiter.api.BeforeEach
    void setUp() throws Exception {
        // taskDispatcher is @Lazy @Autowired, not in constructor — inject via reflection
        java.lang.reflect.Field f = GpuSlotService.class.getDeclaredField("taskDispatcher");
        f.setAccessible(true);
        f.set(gpuSlotService, taskDispatcher);
    }

    private GpuSlot makeAllocatedSlot(Long id, Long taskId, Long nodeId) {
        GpuSlot slot = new GpuSlot();
        slot.setId(id);
        slot.setNodeId(nodeId);
        slot.setGpuIndex(id.intValue());
        slot.setStatus(GpuSlotStatus.ALLOCATED);
        slot.setAllocatedTaskId(taskId);
        slot.setAllocatedAt(Instant.now().minusSeconds(600));
        return slot;
    }

    @Test
    @DisplayName("#499: Orphan slot (task CANCELLED) -> reclaimed to FREE")
    void reclaimOrphanSlots_cancelledTask_reclaimedToFree() {
        GpuSlot orphanSlot = makeAllocatedSlot(1L, 100L, 10L);

        EvaluationTask cancelledTask = new EvaluationTask();
        cancelledTask.setId(100L);
        cancelledTask.setStatus(EvaluationTask.TaskStatus.CANCELLED);

        when(gpuSlotRepository.findAllocatedSlots()).thenReturn(List.of(orphanSlot));
        when(taskRepository.findById(100L)).thenReturn(Optional.of(cancelledTask));

        gpuSlotService.reclaimOrphanSlots();

        assertEquals(GpuSlotStatus.FREE, orphanSlot.getStatus());
        assertNull(orphanSlot.getAllocatedTaskId());
        assertNull(orphanSlot.getAllocatedAt());
        verify(gpuSlotRepository).save(orphanSlot);
    }

    @Test
    @DisplayName("#499: Orphan slot (task FAILED) -> reclaimed to FREE")
    void reclaimOrphanSlots_failedTask_reclaimedToFree() {
        GpuSlot orphanSlot = makeAllocatedSlot(2L, 200L, 10L);

        EvaluationTask failedTask = new EvaluationTask();
        failedTask.setId(200L);
        failedTask.setStatus(EvaluationTask.TaskStatus.FAILED);

        when(gpuSlotRepository.findAllocatedSlots()).thenReturn(List.of(orphanSlot));
        when(taskRepository.findById(200L)).thenReturn(Optional.of(failedTask));

        gpuSlotService.reclaimOrphanSlots();

        assertEquals(GpuSlotStatus.FREE, orphanSlot.getStatus());
        assertNull(orphanSlot.getAllocatedTaskId());
        verify(taskDispatcher).tryDispatchNext();
    }

    @Test
    @DisplayName("#499: Active slot (task RUNNING) -> NOT reclaimed")
    void reclaimOrphanSlots_runningTask_notReclaimed() {
        GpuSlot activeSlot = makeAllocatedSlot(3L, 300L, 10L);

        EvaluationTask runningTask = new EvaluationTask();
        runningTask.setId(300L);
        runningTask.setStatus(EvaluationTask.TaskStatus.RUNNING);

        when(gpuSlotRepository.findAllocatedSlots()).thenReturn(List.of(activeSlot));
        when(taskRepository.findById(300L)).thenReturn(Optional.of(runningTask));

        gpuSlotService.reclaimOrphanSlots();

        assertEquals(GpuSlotStatus.ALLOCATED, activeSlot.getStatus());
        assertEquals(300L, activeSlot.getAllocatedTaskId());
        verify(gpuSlotRepository, never()).save(any());
    }

    @Test
    @DisplayName("#499: Orphan slot (task deleted/missing) -> reclaimed to FREE")
    void reclaimOrphanSlots_missingTask_reclaimedToFree() {
        GpuSlot orphanSlot = makeAllocatedSlot(4L, 999L, 10L);

        when(gpuSlotRepository.findAllocatedSlots()).thenReturn(List.of(orphanSlot));
        when(taskRepository.findById(999L)).thenReturn(Optional.empty());

        gpuSlotService.reclaimOrphanSlots();

        assertEquals(GpuSlotStatus.FREE, orphanSlot.getStatus());
        assertNull(orphanSlot.getAllocatedTaskId());
    }
}
