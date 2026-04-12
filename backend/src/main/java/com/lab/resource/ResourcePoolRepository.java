package com.lab.resource;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

/**
 * #395: ResourcePool Repository with extended filters
 */
public interface ResourcePoolRepository extends JpaRepository<ResourcePool, Long> {
    List<ResourcePool> findByStatus(ResourcePool.Status status);
    Optional<ResourcePool> findByName(String name);
    List<ResourcePool> findByChipModelContainingIgnoreCase(String chipModel);
    List<ResourcePool> findByProvider(String provider);
    List<ResourcePool> findByType(String type);
}
