package com.lab.report;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data
@Entity
@Table(name = "evaluation_reports")
@NoArgsConstructor
@AllArgsConstructor
public class EvaluationReport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "report_no", unique = true, nullable = false, length = 64)
    private String reportNo;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "text")
    private String summary;

    @Column(name = "eval_type", nullable = false, length = 32)
    private String evalType;

    @Column(nullable = false, length = 32)
    private String status = "DRAFT";

    @Column(name = "score")
    private Double score;

    @Column(name = "task_id")
    private Long taskId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metrics", columnDefinition = "jsonb")
    private String metrics;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "chart_data", columnDefinition = "jsonb")
    private String chartData;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "published_at")
    private Instant publishedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
