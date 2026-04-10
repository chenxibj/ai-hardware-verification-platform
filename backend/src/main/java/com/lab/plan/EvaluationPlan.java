package com.lab.plan;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * 评测任务实体类
 */
@Data
@Entity
@Table(name = "evaluation_plans")
@NoArgsConstructor
@AllArgsConstructor
public class EvaluationPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plan_no", unique = true, nullable = false, length = 32)
    private String planNo;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "chip_id", nullable = false)
    private Long chipId;

    @Column(name = "template_id")
    private Long templateId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "eval_config", columnDefinition = "jsonb")
    private String evalConfig;

    @Column(name = "node_id")
    private Long nodeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PlanStatus status;

    @Column(name = "total_tasks")
    private Integer totalTasks = 0;

    @Column(name = "completed_tasks")
    private Integer completedTasks = 0;

    @Column(name = "progress")
    private Integer progress = 0;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Transient
    private String preset;

    @Transient
    private String chipName;

    @Transient
    private String templateName;

    public enum PlanStatus {
        DRAFT, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED
    }
}
