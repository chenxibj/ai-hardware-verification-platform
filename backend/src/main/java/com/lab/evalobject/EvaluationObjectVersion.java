package com.lab.evalobject;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;

@Data @Entity @Table(name = "evaluation_object_versions") @NoArgsConstructor
public class EvaluationObjectVersion {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "object_id", nullable = false) private Long objectId;
    @Column(nullable = false, length = 32) private String version;
    @Column(columnDefinition = "text") private String description;
    @Column(name = "file_reference", length = 512) private String fileReference;
    @Column(name = "parent_version_id") private Long parentVersionId;
    @Column(nullable = false, length = 32) private String status = "PUBLISHED";
    @Column(name = "created_by") private Long createdBy;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
