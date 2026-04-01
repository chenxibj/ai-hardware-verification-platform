package com.lab.resource;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data @Entity @Table(name = "compute_resources") @NoArgsConstructor
public class ComputeResource {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "resource_no", unique = true, nullable = false, length = 64) private String resourceNo;
    @Column(nullable = false, length = 200) private String name;
    @Column(name = "resource_type", nullable = false, length = 32) private String resourceType; // GPU, CPU, NPU, FPGA
    @Column(length = 100) private String model; // e.g. "NVIDIA A100", "Intel Xeon"
    @Column(length = 100) private String vendor;
    @Column(name = "total_count") private Integer totalCount = 0;
    @Column(name = "available_count") private Integer availableCount = 0;
    @Column(length = 32) private String status = "ONLINE"; // ONLINE, OFFLINE, MAINTENANCE
    @Column(name = "pool_name", length = 100) private String poolName;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private String specs; // {"memory":"80GB","tdp":"300W","arch":"Ampere"}
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "utilization", columnDefinition = "jsonb") private String utilization;
    @Column(name = "created_by") private Long createdBy;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
