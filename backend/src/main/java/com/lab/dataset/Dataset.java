package com.lab.dataset;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data @Entity @Table(name = "datasets") @NoArgsConstructor
public class Dataset {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 128) private String name;
    @Column(columnDefinition = "text") private String description;
    @Column(nullable = false, length = 32) private String type;
    @Column(length = 32) private String format;
    @Column(name = "size_bytes") private Long sizeBytes;
    @Column(name = "sample_count") private Integer sampleCount;
    @Column(name = "file_path", length = 512) private String filePath;
    @Column(name = "is_system") private Boolean isSystem = false;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private String metadata;
    @Column(name = "created_by") private Long createdBy;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
