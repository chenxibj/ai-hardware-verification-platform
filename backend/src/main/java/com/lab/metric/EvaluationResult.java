package com.lab.metric;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;

@Data @Entity @Table(name = "evaluation_results") @NoArgsConstructor
public class EvaluationResult {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "task_id", nullable = false) private Long taskId;
    @Column(name = "metric_key", nullable = false, length = 64) private String metricKey;
    @Column(name = "metric_value") private Double metricValue;
    @Column(name = "string_value", length = 256) private String stringValue;
    @Column(name = "config_label", length = 128) private String configLabel;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
