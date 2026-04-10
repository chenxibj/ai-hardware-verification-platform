package com.lab.template;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 评测指标 Repository
 * #325
 */
@Repository
public interface EvaluationMetricRepository extends JpaRepository<EvaluationMetric, Long> {
    Optional<EvaluationMetric> findByMetricKey(String metricKey);
    List<EvaluationMetric> findByCategory(String category);
}
