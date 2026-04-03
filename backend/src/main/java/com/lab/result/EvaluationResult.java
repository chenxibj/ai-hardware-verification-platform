package com.lab.result;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;

@Data
@Entity
@Table(name = "evaluation_results")
@NoArgsConstructor
public class EvaluationResult {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;
    @Column(name = "plan_id", nullable = false)
    private Long planId;
    @Column(name = "chip_id", nullable = false)
    private Long chipId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_data", columnDefinition = "jsonb")
    private String rawData;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metrics_summary", columnDefinition = "jsonb")
    private String metricsSummary;

    private Boolean passed;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
