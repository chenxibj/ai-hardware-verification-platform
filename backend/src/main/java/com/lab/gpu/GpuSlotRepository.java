package com.lab.gpu;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * #396: GpuSlot Repository with pessimistic locking for concurrency safety
 */
public interface GpuSlotRepository extends JpaRepository<GpuSlot, Long> {

    List<GpuSlot> findByNodeIdOrderByGpuIndex(Long nodeId);

    List<GpuSlot> findByAllocatedTaskId(Long taskId);

    @Query("SELECT g FROM GpuSlot g WHERE g.nodeId = :nodeId AND g.status = 'FREE' ORDER BY g.gpuIndex")
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<GpuSlot> findFreeSlotsByNodeForUpdate(@Param("nodeId") Long nodeId);

    @Query("SELECT COUNT(g) FROM GpuSlot g WHERE g.nodeId = :nodeId AND g.status = 'FREE'")
    long countFreeByNodeId(@Param("nodeId") Long nodeId);

    @Query("SELECT g FROM GpuSlot g WHERE g.status = 'ALLOCATED' AND g.allocatedTaskId IS NOT NULL")
    List<GpuSlot> findAllocatedSlots();
}
