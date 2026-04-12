package com.lab.template;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Data
@Entity
@Table(name = "task_templates")
@NoArgsConstructor
public class TaskTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "eval_type")
    private String evalType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "config_json", columnDefinition = "jsonb")
    private String configJson;

    @Column(name = "is_system")
    private Boolean isSystem;

    @Column(name = "evaluation_layer", length = 32)
    private String evaluationLayer;

    @Column(name = "version", length = 32)
    private String version;

    @Column(name = "version_notes", length = 500)
    private String versionNotes;

    @Column(name = "changelog", columnDefinition = "TEXT")
    private String changelog;

    @Column(name = "fork_from")
    private Long forkFrom;

    @Column(name = "created_by")
    private Long createdBy;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    /**
     * #325: 关联评测指标
     */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "template_metrics",
        joinColumns = @JoinColumn(name = "template_id"),
        inverseJoinColumns = @JoinColumn(name = "metric_id")
    )
    private List<EvaluationMetric> metrics = new ArrayList<>();
}
