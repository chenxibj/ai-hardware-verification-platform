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
     * #229: 增强查询 - afterId + level + type + limit (no keyword)
     */
    @Query("SELECT t FROM TaskLog t WHERE t.taskId = :taskId " +
           "AND (:afterId IS NULL OR t.id > :afterId) " +
           "AND (:level IS NULL OR t.level = :level) " +
           "AND (:logType IS NULL OR t.logType = :logType) " +
           "ORDER BY t.id ASC")
    List<TaskLog> findFiltered(
            @Param("taskId") Long taskId,
            @Param("afterId") Long afterId,
            @Param("level") String level,
            @Param("logType") String logType,
            Pageable pageable);

    /**
     * #229: 带 keyword 搜索的查询 (native SQL)
     */
    @Query(value = "SELECT * FROM task_logs t WHERE t.task_id = :taskId " +
           "AND (:afterId IS NULL OR t.id > :afterId) " +
           "AND (:level IS NULL OR t.level = :level) " +
           "AND (:logType IS NULL OR t.log_type = :logType) " +
           "AND t.message ILIKE '%' || :keyword || '%' " +
           "ORDER BY t.id ASC LIMIT :lim",
           nativeQuery = true)
    List<TaskLog> findFilteredWithKeyword(
            @Param("taskId") Long taskId,
            @Param("afterId") Long afterId,
            @Param("level") String level,
            @Param("logType") String logType,
            @Param("keyword") String keyword,
            @Param("lim") int lim);
}
