package com.lab.evallog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.Instant;

@Repository
public interface EvalLogRepository extends JpaRepository<EvalLog, Long> {

    @Query(value = "SELECT * FROM eval_logs l WHERE " +
           "(CAST(:taskId AS BIGINT) IS NULL OR l.task_id = CAST(:taskId AS BIGINT)) " +
           "AND (CAST(:level AS TEXT) IS NULL OR l.log_level = CAST(:level AS TEXT)) " +
           "AND (CAST(:search AS TEXT) IS NULL OR LOWER(l.message) LIKE LOWER('%' || CAST(:search AS TEXT) || '%')) " +
           "AND (CAST(:startTime AS TIMESTAMPTZ) IS NULL OR l.created_at >= CAST(:startTime AS TIMESTAMPTZ)) " +
           "AND (CAST(:endTime AS TIMESTAMPTZ) IS NULL OR l.created_at <= CAST(:endTime AS TIMESTAMPTZ)) " +
           "ORDER BY l.created_at DESC",
           countQuery = "SELECT COUNT(*) FROM eval_logs l WHERE " +
           "(CAST(:taskId AS BIGINT) IS NULL OR l.task_id = CAST(:taskId AS BIGINT)) " +
           "AND (CAST(:level AS TEXT) IS NULL OR l.log_level = CAST(:level AS TEXT)) " +
           "AND (CAST(:search AS TEXT) IS NULL OR LOWER(l.message) LIKE LOWER('%' || CAST(:search AS TEXT) || '%')) " +
           "AND (CAST(:startTime AS TIMESTAMPTZ) IS NULL OR l.created_at >= CAST(:startTime AS TIMESTAMPTZ)) " +
           "AND (CAST(:endTime AS TIMESTAMPTZ) IS NULL OR l.created_at <= CAST(:endTime AS TIMESTAMPTZ))",
           nativeQuery = true)
    Page<EvalLog> findFiltered(
            @Param("taskId") Long taskId,
            @Param("level") String level,
            @Param("search") String search,
            @Param("startTime") Instant startTime,
            @Param("endTime") Instant endTime,
            Pageable pageable);

    long countByLogLevel(String logLevel);
}
