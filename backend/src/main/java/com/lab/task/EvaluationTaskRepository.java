package com.lab.task;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface EvaluationTaskRepository extends JpaRepository<EvaluationTask, Long> {
    Page<EvaluationTask> findByStatus(String status, Pageable pageable);
    List<EvaluationTask> findByStatus(String status);
    Page<EvaluationTask> findByEvalType(String evalType, Pageable pageable);
    Page<EvaluationTask> findByNameContaining(String name, Pageable pageable);
    long countByStatus(String status);
    
    @Query("SELECT t FROM EvaluationTask t WHERE t.status = 'PENDING' ORDER BY " +
           "CASE t.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END, " +
           "t.createdAt ASC")
    List<EvaluationTask> findPendingTasksOrderByPriority();
    
    List<EvaluationTask> findByCreatedByOrderByCreatedAtDesc(Long userId);
    Page<EvaluationTask> findByCreatedBy(Long userId, Pageable pageable);
}
