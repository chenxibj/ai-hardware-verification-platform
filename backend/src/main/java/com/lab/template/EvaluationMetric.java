package com.lab.template;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * 评测指标实体
 * #325 - 模板关联评测指标
 */
@Data
@Entity
@Table(name = "evaluation_metrics")
@NoArgsConstructor
public class EvaluationMetric {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "metric_key", unique = true, nullable = false, length = 64)
    private String metricKey;

    @Column(name = "metric_name", nullable = false, length = 128)
    private String metricName;

    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "data_type", nullable = false, length = 16)
    private String dataType;

    @Column(length = 32)
    private String unit;

    private String description;

    @Column(name = "is_key_metric")
    private Boolean isKeyMetric;

    @Column(name = "sort_order")
    private Integer sortOrder;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
