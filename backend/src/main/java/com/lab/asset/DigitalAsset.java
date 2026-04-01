package com.lab.asset;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data @Entity @Table(name = "digital_assets") @NoArgsConstructor
public class DigitalAsset {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "asset_no", unique = true, nullable = false, length = 64) private String assetNo;
    @Column(nullable = false, length = 200) private String name;
    @Column(name = "asset_type", nullable = false, length = 32) private String assetType; // MODEL, DATASET, SCRIPT, BENCHMARK, CONFIG
    @Column(length = 500) private String description;
    @Column(length = 32) private String version;
    @Column(name = "file_path", length = 512) private String filePath;
    @Column(name = "file_size") private Long fileSize;
    @Column(name = "mime_type", length = 100) private String mimeType;
    @Column(length = 32) private String status = "ACTIVE"; // ACTIVE, ARCHIVED, DELETED
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private String tags;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private String metadata;
    @Column(name = "download_count") private Integer downloadCount = 0;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
