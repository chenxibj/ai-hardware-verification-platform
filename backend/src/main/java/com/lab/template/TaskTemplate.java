package com.lab.template;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data @Entity @Table(name = "task_templates") @NoArgsConstructor
public class TaskTemplate {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 128) private String name;
    @Column(columnDefinition = "text") private String description;
    @Column(name = "eval_type", nullable = false, length = 32) private String evalType;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "config_json", nullable = false, columnDefinition = "jsonb") private String configJson;
    @Column(name = "is_system") private Boolean isSystem = false;
    @Column(name = "created_by") private Long createdBy;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
