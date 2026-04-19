package com.lab.task;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * 评测任务 Repository
 */
@Repository
public interface EvaluationTaskRepository extends JpaRepository<EvaluationTask, Long> {

    Optional<EvaluationTask> findByTaskNo(String taskNo);

    Page<EvaluationTask> findByCreatedBy(Long userId, Pageable pageable);

    Page<EvaluationTask> findByStatus(EvaluationTask.TaskStatus status, Pageable pageable);

    @Query("SELECT t FROM EvaluationTask t WHERE t.createdBy = :userId AND t.status = :status")
    Page<EvaluationTask> findByUserIdAndStatus(@Param("userId") Long userId,
                                                @Param("status") EvaluationTask.TaskStatus status,
                                                Pageable pageable);

    @Query("SELECT t FROM EvaluationTask t WHERE t.status = 'QUEUED' ORDER BY CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END ASC, t.createdAt ASC")
    List<EvaluationTask> findQueuedTasksOrderByPriorityAndCreatedAt();

    List<EvaluationTask> findByPlanId(Long planId);
    Page<EvaluationTask> findByPlanId(Long planId, Pageable pageable);
    long countByCreatedByAndStatus(Long userId, EvaluationTask.TaskStatus status);
    long countByPlanIdAndStatus(Long planId, EvaluationTask.TaskStatus status);

    // #222 - TaskDispatcher queries
    List<EvaluationTask> findByPlanIdAndStatus(Long planId, EvaluationTask.TaskStatus status);

    // #223 - Recovery queries
    List<EvaluationTask> findByStatus(EvaluationTask.TaskStatus status);

    @Query("SELECT t FROM EvaluationTask t WHERE t.status = :status AND t.updatedAt < :threshold")
    List<EvaluationTask> findByStatusAndUpdatedAtBefore(
            @Param("status") EvaluationTask.TaskStatus status,
            @Param("threshold") Instant threshold);

    // Heartbeat-based stale detection for recovery scheduler
    @Query("SELECT t FROM EvaluationTask t WHERE t.status = :status AND (t.lastHeartbeatAt < :threshold OR t.lastHeartbeatAt IS NULL)")
    List<EvaluationTask> findByStatusAndLastHeartbeatAtBefore(
            @Param("status") EvaluationTask.TaskStatus status,
            @Param("threshold") Instant threshold);

    List<EvaluationTask> findByAssignedNodeId(Long nodeId);

    // Indexed queries for pollTasks (avoid findAll + stream filter)
    List<EvaluationTask> findByStatusAndAssignedNodeId(EvaluationTask.TaskStatus status, Long assignedNodeId);
    List<EvaluationTask> findByAssignedNodeIdAndStatus(Long assignedNodeId, EvaluationTask.TaskStatus status);

    List<EvaluationTask> findByResourcePoolIdAndStatus(Long resourcePoolId, EvaluationTask.TaskStatus status);
    List<EvaluationTask> findByResourcePoolIdAndStatusIn(Long resourcePoolId, List<EvaluationTask.TaskStatus> statuses);

    // Stale task cleanup
    List<EvaluationTask> findByStatusAndCreatedAtBefore(EvaluationTask.TaskStatus status, Instant threshold);

    // #227: Stats
    long countByStatus(EvaluationTask.TaskStatus status);
    // #321: chipId filter
    Page<EvaluationTask> findByChipId(Long chipId, Pageable pageable);

    // #478 P6: Queue position calculation — #478 P7: Fix SQL (subquery for LIMIT with AVG)
    @Query(value = "SELECT AVG(sub.duration) FROM (SELECT EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) AS duration FROM evaluation_tasks t WHERE t.status = 'COMPLETED' AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL ORDER BY t.completed_at DESC LIMIT 50) sub", nativeQuery = true)
    Double findAverageCompletedDurationSeconds();

    // #481: Average duration grouped by evalType (last 7 days)
    @Query(value = "SELECT eval_type, AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) " +
            "FROM evaluation_tasks " +
            "WHERE status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL " +
            "AND completed_at > NOW() - INTERVAL '7 days' " +
            "GROUP BY eval_type", nativeQuery = true)
    List<Object[]> findAverageDurationByEvalTypeRaw();

    // #493: Metrics — count tasks completed in a time window
    @Query("SELECT COUNT(t) FROM EvaluationTask t WHERE t.status = com.lab.task.EvaluationTask$TaskStatus.COMPLETED AND t.completedAt > :since")
    long countCompletedSince(@Param("since") Instant since);

    // #493: Metrics — average dispatch delay (seconds) for tasks started in last hour
    @Query(value = "SELECT AVG(EXTRACT(EPOCH FROM (t.started_at - t.created_at))) " +
            "FROM evaluation_tasks t WHERE t.status IN ('COMPLETED','RUNNING','FAILED') " +
            "AND t.started_at IS NOT NULL AND t.started_at > NOW() - INTERVAL '1 hour'", nativeQuery = true)
    Double findAverageDispatchDelaySecondsLastHour();
}
