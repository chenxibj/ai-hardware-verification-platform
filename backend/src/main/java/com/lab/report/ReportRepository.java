package com.lab.report;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface ReportRepository extends JpaRepository<EvaluationReport, Long> {
    Optional<EvaluationReport> findByReportNo(String reportNo);
    Page<EvaluationReport> findByCreatedBy(Long userId, Pageable pageable);
    Page<EvaluationReport> findByStatus(String status, Pageable pageable);
    Page<EvaluationReport> findByEvalType(String evalType, Pageable pageable);
    Page<EvaluationReport> findByTitleContaining(String keyword, Pageable pageable);
    long countByStatus(String status);
    @Query("SELECT AVG(r.score) FROM EvaluationReport r WHERE r.score IS NOT NULL")
    Double averageScore();
}
