package com.lab.runspec;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

/**
 * #394: RunSpec Repository
 */
public interface RunSpecRepository extends JpaRepository<RunSpec, Long> {
    Optional<RunSpec> findByCode(String code);
    List<RunSpec> findByCategory(String category);
    List<RunSpec> findByIsSystemTrue();
}
