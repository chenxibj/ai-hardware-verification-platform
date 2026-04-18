package com.lab.gpu;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

import java.lang.reflect.Field;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #479: Test that initializeSlots() uses PostgreSQL advisory lock
 */
@ExtendWith(MockitoExtension.class)
class GpuSlotServiceConcurrencyTest {

    @Mock
    private GpuSlotRepository gpuSlotRepository;

    @Mock
    private com.lab.task.EvaluationTaskRepository taskRepository;

    @Mock
    private EntityManager entityManager;

    private GpuSlotService gpuSlotService;

    @BeforeEach
    void setUp() throws Exception {
        gpuSlotService = new GpuSlotService(gpuSlotRepository, taskRepository);
        // Inject entityManager via reflection (it's @PersistenceContext, not constructor-injected)
        Field emField = GpuSlotService.class.getDeclaredField("entityManager");
        emField.setAccessible(true);
        emField.set(gpuSlotService, entityManager);
    }

    @Test
    @DisplayName("#479: initializeSlots acquires advisory lock before creating slots")
    void testInitializeSlotsAcquiresAdvisoryLock() {
        Long nodeId = 42L;
        int gpuCount = 4;
        List<Map<String, Object>> gpuDetails = new ArrayList<>();
        for (int i = 0; i < gpuCount; i++) {
            Map<String, Object> detail = new HashMap<>();
            detail.put("index", i);
            detail.put("name", "NVIDIA L40S");
            detail.put("memory_total_mb", 46068);
            gpuDetails.add(detail);
        }

        Query mockQuery = mock(Query.class);
        when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(:nodeId)"))
                .thenReturn(mockQuery);
        when(mockQuery.setParameter("nodeId", nodeId)).thenReturn(mockQuery);
        when(mockQuery.getSingleResult()).thenReturn(null);

        when(gpuSlotRepository.findByNodeIdOrderByGpuIndex(nodeId))
                .thenReturn(new ArrayList<>());
        when(gpuSlotRepository.save(any(GpuSlot.class))).thenAnswer(inv -> inv.getArgument(0));

        gpuSlotService.initializeSlots(nodeId, gpuCount, gpuDetails);

        verify(entityManager).createNativeQuery("SELECT pg_advisory_xact_lock(:nodeId)");
        verify(mockQuery).setParameter("nodeId", nodeId);
        verify(mockQuery).getSingleResult();
        verify(gpuSlotRepository, times(gpuCount)).save(any(GpuSlot.class));
    }

    @Test
    @DisplayName("#479: initializeSlots with 0 gpuCount skips lock entirely")
    void testInitializeSlotsZeroGpuSkipsLock() {
        gpuSlotService.initializeSlots(1L, 0, null);

        verifyNoInteractions(entityManager);
        verify(gpuSlotRepository, never()).findByNodeIdOrderByGpuIndex(anyLong());
    }

    @Test
    @DisplayName("#479: initializeSlots with matching slot count still acquires lock")
    void testInitializeSlotsMatchingCountStillLocks() {
        Long nodeId = 10L;
        int gpuCount = 2;

        Query mockQuery = mock(Query.class);
        when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(:nodeId)"))
                .thenReturn(mockQuery);
        when(mockQuery.setParameter("nodeId", nodeId)).thenReturn(mockQuery);
        when(mockQuery.getSingleResult()).thenReturn(null);

        List<GpuSlot> existing = new ArrayList<>();
        for (int i = 0; i < gpuCount; i++) {
            GpuSlot slot = new GpuSlot();
            slot.setNodeId(nodeId);
            slot.setGpuIndex(i);
            slot.setStatus("FREE");
            existing.add(slot);
        }
        when(gpuSlotRepository.findByNodeIdOrderByGpuIndex(nodeId)).thenReturn(existing);
        when(gpuSlotRepository.saveAll(anyList())).thenReturn(existing);

        gpuSlotService.initializeSlots(nodeId, gpuCount, null);

        verify(entityManager).createNativeQuery("SELECT pg_advisory_xact_lock(:nodeId)");
    }
}
