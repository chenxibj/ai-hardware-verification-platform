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

    @Query("SELECT l FROM EvalLog l WHERE " +
           "(:taskId IS NULL OR l.taskId = :taskId) " +
           "AND (:level IS NULL OR l.logLevel = :level) " +
           "AND (:search IS NULL OR LOWER(l.message) LIKE LOWER(CONCAT('%', :search, '%'))) " +
           "AND (:startTime IS NULL OR l.createdAt >= :startTime) " +
           "AND (:endTime IS NULL OR l.createdAt <= :endTime) " +
           "ORDER BY l.createdAt DESC")
    Page<EvalLog> findFiltered(
            @Param("taskId") Long taskId,
            @Param("level") String level,
            @Param("search") String search,
            @Param("startTime") Instant startTime,
            @Param("endTime") Instant endTime,
            Pageable pageable);

    long countByLogLevel(String logLevel);
}
