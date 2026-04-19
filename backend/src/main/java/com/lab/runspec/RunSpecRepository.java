package com.lab.runspec;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

/**
 * #394: RunSpec Repository
 * #530: Added findByGpuPerNodeAndParallelMode for inferring runSpec from evalConfig
 */
public interface RunSpecRepository extends JpaRepository<RunSpec, Long> {
    Optional<RunSpec> findByCode(String code);
    List<RunSpec> findByCategory(String category);
    List<RunSpec> findByIsSystemTrue();

    /** #530: Find run spec by GPU count and parallel mode for legacy plan inference */
    Optional<RunSpec> findByGpuPerNodeAndParallelMode(Integer gpuPerNode, String parallelMode);
}
