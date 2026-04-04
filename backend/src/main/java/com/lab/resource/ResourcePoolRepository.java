package com.lab.resource;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ResourcePoolRepository extends JpaRepository<ResourcePool, Long> {
    List<ResourcePool> findByStatus(ResourcePool.Status status);
    Optional<ResourcePool> findByName(String name);
}
