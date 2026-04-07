package com.lab.task;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TaskLogRepository extends JpaRepository<TaskLog, Long> {
    List<TaskLog> findByTaskIdOrderByCreatedAtAsc(Long taskId);
    long countByTaskId(Long taskId);

    /**
     * #229: 增强查询 - afterId + level + type + keyword + limit
     */
    @Query("SELECT t FROM TaskLog t WHERE t.taskId = :taskId " +
           "AND (:afterId IS NULL OR t.id > :afterId) " +
           "AND (:level IS NULL OR t.level = :level) " +
           "AND (:logType IS NULL OR t.logType = :logType) " +
           "AND (:keyword IS NULL OR LOWER(t.message) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
           "     OR LOWER(t.content) LIKE LOWER(CONCAT('%', :keyword, '%'))) " +
           "ORDER BY t.id ASC")
    List<TaskLog> findFiltered(
            @Param("taskId") Long taskId,
            @Param("afterId") Long afterId,
            @Param("level") String level,
            @Param("logType") String logType,
            @Param("keyword") String keyword,
            Pageable pageable);
}
