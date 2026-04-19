package com.lab.task;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.List;

/**
 * 评测任务实体类
 */
@Data
@Entity
@Table(name = "evaluation_tasks")
@NoArgsConstructor
@AllArgsConstructor
public class EvaluationTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_no", nullable = false, length = 64)
    private String taskNo;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "task_type", nullable = false, length = 32)
    @Enumerated(EnumType.STRING)
    private TaskType taskType; // TEMPLATE or CUSTOM

    @Column(name = "eval_type", nullable = false, length = 32)
    @Enumerated(EnumType.STRING)
    private EvalType evalType; // MODEL, CHIP, FRAMEWORK, OPERATOR, PERFORMANCE, ACCURACY, COMPATIBILITY, GENERAL, CLUSTER, TRAINING

    @Column(name = "status", nullable = false, length = 32)
    @Enumerated(EnumType.STRING)
    private TaskStatus status; // PENDING, QUEUED, DISPATCHED, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED, SKIPPED

    @Column(name = "priority", nullable = false, length = 16)
    @Enumerated(EnumType.STRING)
    private Priority priority; // HIGH, MEDIUM, LOW

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "eval_config", nullable = false, columnDefinition = "jsonb")
    private String evalConfig;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "dataset_ids", columnDefinition = "bigint[]")
    private Long[] datasetIds;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "resource_spec", columnDefinition = "jsonb")
    private String resourceSpec;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "allocated_resources", columnDefinition = "jsonb")
    private String allocatedResources;

    @Column(name = "resource_pool_id")
    private Long resourcePoolId;

    @Column(name = "progress", nullable = false)
    private Integer progress = 0;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "plan_id")
    private Long planId;

    @Column(name = "chip_id")
    private Long chipId;

    @Enumerated(EnumType.STRING)
    @Column(name = "test_subject", length = 16)
    private TestSubject testSubject;

    @Column(name = "test_item", length = 64)
    private String testItem;

    @Column(name = "dimension", length = 32)
    private String dimension;

    // ---- #224 新增字段 ----

    @Version
    @Column(name = "version")
    private Long version;

    @Column(name = "timeout_seconds")
    private Integer timeoutSeconds;

    @Column(name = "assigned_node_id")
    private Long assignedNodeId;

    @Column(name = "last_heartbeat_at")
    private Instant lastHeartbeatAt;
    @Column(name = "last_progress_update_at")
    private Instant lastProgressUpdateAt;

    @Transient
    private String warningMessage;

    @Transient
    private Boolean isStalled;
    @Column(name = "queue_reason", length = 500)
    private String queueReason;

    @Column(name = "queue_position")
    private Integer queuePosition;

    @Column(name = "estimated_wait_minutes")
    private Integer estimatedWaitMinutes;

    @Column(name = "allocated_gpu_indices", length = 200)
    private String allocatedGpuIndices;  // JSON: "[0,1,2,3]"

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "retry_count", nullable = false)
    private Integer retryCount = 0;

    @Column(name = "run_spec_id")
    private Long runSpecId;

    @Column(name = "run_spec_code", length = 64)
    private String runSpecCode;

    public enum TaskType {
        TEMPLATE, CUSTOM, EVALUATION
    }

    public enum EvalType {
        MODEL, CHIP, FRAMEWORK, OPERATOR, PERFORMANCE, ACCURACY, COMPATIBILITY, GENERAL, CLUSTER, TRAINING
    }

    public enum TaskStatus {
        PENDING, QUEUED, DISPATCHED, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED, SKIPPED
    }

    public enum TestSubject {
        OPERATOR, MODEL, TRAINING
    }

    public enum Priority {
        HIGH, MEDIUM, LOW
    }
}
