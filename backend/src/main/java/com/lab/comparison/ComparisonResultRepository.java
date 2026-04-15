package com.lab.comparison;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * #444: Repository for ComparisonResult entity.
 */
@Repository
public interface ComparisonResultRepository extends JpaRepository<ComparisonResult, Long> {
}
