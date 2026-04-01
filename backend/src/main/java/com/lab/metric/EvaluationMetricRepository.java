package com.lab.metric;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface EvaluationMetricRepository extends JpaRepository<EvaluationMetric, Long> {
    Optional<EvaluationMetric> findByMetricKey(String metricKey);
    List<EvaluationMetric> findByCategory(String category);
    List<EvaluationMetric> findByIsKeyMetricTrueOrderBySortOrder();
    List<EvaluationMetric> findAllByOrderBySortOrder();
}
