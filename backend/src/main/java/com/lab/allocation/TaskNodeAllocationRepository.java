package com.lab.allocation;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

/**
 * #399: TaskNodeAllocation Repository
 */
public interface TaskNodeAllocationRepository extends JpaRepository<TaskNodeAllocation, Long> {
    List<TaskNodeAllocation> findByTaskIdOrderByNodeRank(Long taskId);
    List<TaskNodeAllocation> findByNodeId(Long nodeId);
    Optional<TaskNodeAllocation> findByTaskIdAndNodeId(Long taskId, Long nodeId);
    void deleteByTaskId(Long taskId);
}
