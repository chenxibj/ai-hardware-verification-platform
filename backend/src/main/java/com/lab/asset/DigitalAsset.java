package com.lab.asset;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * 数字资产实体
 */
@Data
@Entity
@Table(name = "digital_assets")
@NoArgsConstructor
@AllArgsConstructor
public class DigitalAsset {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "asset_no", unique = true, nullable = false, length = 64)
    private String assetNo;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "asset_type", nullable = false, length = 32)
    private String assetType;

    @Column(length = 500)
    private String description;

    @Column(length = 32)
    private String version;

    @Column(name = "file_path", length = 512)
    private String filePath;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "mime_type", length = 100)
    private String mimeType;

    @Column(name = "file_format", length = 32)
    private String fileFormat;

    @Column(name = "source_url", length = 512)
    private String sourceUrl;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private Status status = Status.ACTIVE;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String tags;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String metadata;

    @Column(name = "download_count")
    private Integer downloadCount = 0;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public enum Status {
        ACTIVE, ARCHIVED, DELETED
    }
}
