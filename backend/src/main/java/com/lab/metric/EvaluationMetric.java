package com.lab.metric;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;

@Data @Entity @Table(name = "evaluation_metrics") @NoArgsConstructor
public class EvaluationMetric {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "metric_key", unique = true, nullable = false, length = 64) private String metricKey;
    @Column(name = "metric_name", nullable = false, length = 128) private String metricName;
    @Column(nullable = false, length = 32) private String category;
    @Column(length = 32) private String unit;
    @Column(name = "data_type", nullable = false, length = 16) private String dataType = "FLOAT";
    @Column(columnDefinition = "text") private String description;
    @Column(name = "is_key_metric") private Boolean isKeyMetric = false;
    @Column(name = "sort_order") private Integer sortOrder = 0;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
