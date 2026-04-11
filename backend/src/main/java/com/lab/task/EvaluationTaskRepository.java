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

    @Query("SELECT t FROM EvaluationTask t WHERE t.status = 'QUEUED' ORDER BY t.priority ASC, t.createdAt ASC")
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

    List<EvaluationTask> findByAssignedNodeId(Long nodeId);
    List<EvaluationTask> findByResourcePoolIdAndStatus(Long resourcePoolId, EvaluationTask.TaskStatus status);
    List<EvaluationTask> findByResourcePoolIdAndStatusIn(Long resourcePoolId, List<EvaluationTask.TaskStatus> statuses);

    // Stale task cleanup
    List<EvaluationTask> findByStatusAndCreatedAtBefore(EvaluationTask.TaskStatus status, Instant threshold);

    // #227: Stats
    long countByStatus(EvaluationTask.TaskStatus status);
    // #321: chipId filter
    Page<EvaluationTask> findByChipId(Long chipId, Pageable pageable);
}
