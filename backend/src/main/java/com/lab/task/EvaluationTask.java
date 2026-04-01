package com.lab.task;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data @Entity @Table(name = "evaluation_tasks") @NoArgsConstructor
public class EvaluationTask {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "task_no", unique = true, nullable = false, length = 64) private String taskNo;
    @Column(nullable = false, length = 200) private String name;
    @Column(length = 500) private String description;
    @Column(name = "eval_type", length = 32) private String evalType;
    @Column(name = "eval_object", length = 32) private String evalObject;
    @Column(name = "target_model", length = 100) private String targetModel;
    @Column(name = "dataset_ids", length = 500) private String datasetIds;
    @Column(nullable = false, length = 32) private String status = "PENDING";
    @Column(length = 16) private String priority = "MEDIUM"; // LOW, MEDIUM, HIGH, CRITICAL
    @Column(length = 500) private String tags;
    private Integer progress = 0;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private String result;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "config", columnDefinition = "jsonb") private String config;
    @Column(name = "error_message", columnDefinition = "text") private String errorMessage;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
