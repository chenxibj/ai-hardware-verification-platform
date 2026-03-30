package com.lab.task;

import jakarta.persistence.*;
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

    @Column(name = "task_no", unique = true, nullable = false, length = 64)
    private String taskNo;

    @Column(name = "task_type", nullable = false, length = 32)
    @Enumerated(EnumType.STRING)
    private TaskType taskType; // TEMPLATE or CUSTOM

    @Column(name = "eval_type", nullable = false, length = 32)
    @Enumerated(EnumType.STRING)
    private EvalType evalType; // MODEL, CHIP, FRAMEWORK, OPERATOR

    @Column(name = "status", nullable = false, length = 32)
    @Enumerated(EnumType.STRING)
    private TaskStatus status; // PENDING, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED

    @Column(name = "priority", nullable = false, length = 16)
    @Enumerated(EnumType.STRING)
    private Priority priority; // HIGH, MEDIUM, LOW

    @Column(name = "eval_config", nullable = false, columnDefinition = "jsonb")
    private String evalConfig;

    @Column(name = "dataset_ids", columnDefinition = "bigint[]")
    private List<Long> datasetIds;

    @Column(name = "resource_spec", columnDefinition = "jsonb")
    private String resourceSpec;

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

    public enum TaskType {
        TEMPLATE, CUSTOM
    }

    public enum EvalType {
        MODEL, CHIP, FRAMEWORK, OPERATOR
    }

    public enum TaskStatus {
        PENDING, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED
    }

    public enum Priority {
        HIGH, MEDIUM, LOW
    }
}
