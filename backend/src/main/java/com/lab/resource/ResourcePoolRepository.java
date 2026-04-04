package com.lab.resource;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ResourcePoolRepository extends JpaRepository<ResourcePool, Long> {
    List<ResourcePool> findByStatus(ResourcePool.Status status);
}
