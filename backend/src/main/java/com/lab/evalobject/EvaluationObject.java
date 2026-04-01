package com.lab.evalobject;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data @Entity @Table(name = "evaluation_objects") @NoArgsConstructor
public class EvaluationObject {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 128) private String name;
    @Column(nullable = false, length = 32) private String type; // MODEL/OPERATOR/FRAMEWORK/CHIP
    @Column(length = 64) private String framework;
    @Column(columnDefinition = "text") private String description;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private String metadata;
    @Column(nullable = false, length = 32) private String status = "ACTIVE";
    @Column(name = "created_by") private Long createdBy;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
