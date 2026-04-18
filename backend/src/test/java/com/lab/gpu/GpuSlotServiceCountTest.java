package com.lab.gpu;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * #487: Test that countFreeSlots and countTotalSlots use @Query COUNT
 * instead of findAll().stream() to avoid JPA L1 cache dirty reads.
 */
@ExtendWith(MockitoExtension.class)
class GpuSlotServiceCountTest {

    @Mock
    private GpuSlotRepository gpuSlotRepository;

    @Mock
    private com.lab.task.EvaluationTaskRepository taskRepository;

    @InjectMocks
    private GpuSlotService gpuSlotService;

    @Test
    @DisplayName("#487: countFreeSlots delegates to repository @Query method")
    void testCountFreeSlotsUsesRepositoryQuery() {
        when(gpuSlotRepository.countFreeByNodeId(1L)).thenReturn(5L);

        long result = gpuSlotService.countFreeSlots(1L);

        assertEquals(5L, result);
        // Verify it calls the @Query method, NOT findAll()
        verify(gpuSlotRepository).countFreeByNodeId(1L);
        verify(gpuSlotRepository, never()).findAll();
    }

    @Test
    @DisplayName("#487: countTotalSlots delegates to repository @Query method")
    void testCountTotalSlotsUsesRepositoryQuery() {
        when(gpuSlotRepository.countTotalByNodeId(1L)).thenReturn(8L);

        long result = gpuSlotService.countTotalSlots(1L);

        assertEquals(8L, result);
        verify(gpuSlotRepository).countTotalByNodeId(1L);
        verify(gpuSlotRepository, never()).findAll();
    }

    @Test
    @DisplayName("#487: countFreeSlots returns 0 when no free slots")
    void testCountFreeSlotsReturnsZero() {
        when(gpuSlotRepository.countFreeByNodeId(1L)).thenReturn(0L);

        assertEquals(0L, gpuSlotService.countFreeSlots(1L));
    }

    @Test
    @DisplayName("#487: countTotalSlots returns 0 for node with no GPU slots")
    void testCountTotalSlotsReturnsZeroForCpuNode() {
        when(gpuSlotRepository.countTotalByNodeId(99L)).thenReturn(0L);

        assertEquals(0L, gpuSlotService.countTotalSlots(99L));
    }
}
