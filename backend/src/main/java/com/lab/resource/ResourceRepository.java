package com.lab.resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
@Repository
public interface ResourceRepository extends JpaRepository<ComputeResource, Long> {
    Page<ComputeResource> findByResourceType(String resourceType, Pageable pageable);
    Page<ComputeResource> findByStatus(String status, Pageable pageable);
    Page<ComputeResource> findByPoolName(String poolName, Pageable pageable);
    long countByResourceType(String resourceType);
    long countByStatus(String status);
    @Query("SELECT COALESCE(SUM(r.totalCount),0) FROM ComputeResource r")
    long sumTotalCount();
    @Query("SELECT COALESCE(SUM(r.availableCount),0) FROM ComputeResource r")
    long sumAvailableCount();
}
