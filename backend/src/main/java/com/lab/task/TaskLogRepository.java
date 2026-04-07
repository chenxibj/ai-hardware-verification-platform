package com.lab.task;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
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

    // ── #233: 日志统计查询 ──

    @Query("SELECT tl.level, COUNT(tl) FROM TaskLog tl WHERE tl.taskId = :taskId GROUP BY tl.level")
    List<Object[]> countByTaskIdGroupByLevel(@Param("taskId") Long taskId);

    @Query("SELECT tl.logType, COUNT(tl) FROM TaskLog tl WHERE tl.taskId = :taskId GROUP BY tl.logType")
    List<Object[]> countByTaskIdGroupByLogType(@Param("taskId") Long taskId);

    long countByTaskIdAndLogType(Long taskId, String logType);

    // ── #233: 时间范围查询 ──

    @Query("SELECT MIN(tl.createdAt) FROM TaskLog tl WHERE tl.taskId = :taskId")
    Instant findFirstCreatedAtByTaskId(@Param("taskId") Long taskId);

    @Query("SELECT MAX(tl.createdAt) FROM TaskLog tl WHERE tl.taskId = :taskId")
    Instant findLastCreatedAtByTaskId(@Param("taskId") Long taskId);

    // ── P2-1: 按类型查询 ──

    List<TaskLog> findByTaskIdAndLogType(Long taskId, String logType);

    // ── P1-5: 日志保留策略 — 清理旧日志 ──

    @Modifying
    @Transactional
    @Query("DELETE FROM TaskLog tl WHERE tl.createdAt < :cutoff")
    int deleteByCreatedAtBefore(@Param("cutoff") Instant cutoff);

    // ── P1-2: 游标分页 (带 before 支持) ──

    @Query("SELECT t FROM TaskLog t WHERE t.taskId = :taskId " +
           "AND (:afterId IS NULL OR t.id > :afterId) " +
           "AND (:beforeId IS NULL OR t.id < :beforeId) " +
           "AND (:level IS NULL OR t.level = :level) " +
           "AND (:logType IS NULL OR t.logType = :logType) " +
           "ORDER BY t.id ASC")
    List<TaskLog> findFilteredCursor(
            @Param("taskId") Long taskId,
            @Param("afterId") Long afterId,
            @Param("beforeId") Long beforeId,
            @Param("level") String level,
            @Param("logType") String logType,
            Pageable pageable);

    // ── P1-2: 游标分页 + keyword ──

    @Query(value = "SELECT * FROM task_logs t WHERE t.task_id = :taskId " +
           "AND (:afterId IS NULL OR t.id > :afterId) " +
           "AND (:beforeId IS NULL OR t.id < :beforeId) " +
           "AND (:level IS NULL OR t.level = :level) " +
           "AND (:logType IS NULL OR t.log_type = :logType) " +
           "AND t.message ILIKE '%' || :keyword || '%' " +
           "ORDER BY t.id ASC LIMIT :lim",
           nativeQuery = true)
    List<TaskLog> findFilteredCursorWithKeyword(
            @Param("taskId") Long taskId,
            @Param("afterId") Long afterId,
            @Param("beforeId") Long beforeId,
            @Param("level") String level,
            @Param("logType") String logType,
            @Param("keyword") String keyword,
            @Param("lim") int lim);

    // ── P2-2: 带过滤的完整查询 ──

    @Query("SELECT t FROM TaskLog t WHERE t.taskId = :taskId " +
           "AND (:level IS NULL OR t.level = :level) " +
           "AND (:logType IS NULL OR t.logType = :logType) " +
           "ORDER BY t.id ASC")
    List<TaskLog> findByTaskIdFiltered(
            @Param("taskId") Long taskId,
            @Param("level") String level,
            @Param("logType") String logType);
}
