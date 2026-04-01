package com.lab.log;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
@Repository
public interface EvalLogRepository extends JpaRepository<EvalLog, Long> {
    Page<EvalLog> findByTaskId(Long taskId, Pageable pageable);
    Page<EvalLog> findByLogLevel(String logLevel, Pageable pageable);
    Page<EvalLog> findByTaskIdAndLogLevel(Long taskId, String logLevel, Pageable pageable);
    long countByTaskId(Long taskId);
    long countByLogLevel(String logLevel);
}
