package com.lab.metric;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
public interface EvaluationResultRepository extends JpaRepository<EvaluationResult, Long> {
    List<EvaluationResult> findByTaskIdOrderByMetricKey(Long taskId);
    List<EvaluationResult> findByTaskIdAndMetricKey(Long taskId, String metricKey);
    @Query("SELECT r FROM EvaluationResult r WHERE r.taskId IN :taskIds ORDER BY r.taskId, r.metricKey")
    List<EvaluationResult> findByTaskIds(List<Long> taskIds);
}
