package com.lab.runspec;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * 运行规格实体 — 描述任务对算力资源的需求
 * #394
 */
@Data
@Entity
@Table(name = "run_specs")
@NoArgsConstructor
@AllArgsConstructor
public class RunSpec {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(unique = true, nullable = false, length = 64)
    private String code;

    @Column(name = "node_count", nullable = false)
    private Integer nodeCount = 1;

    @Column(name = "gpu_per_node", nullable = false)
    private Integer gpuPerNode = 0;

    @Column(name = "gpu_exclusive")
    private Boolean gpuExclusive = false;

    @Column(name = "cpu_cores")
    private Integer cpuCores;

    @Column(name = "cpu_exclusive")
    private Boolean cpuExclusive = false;

    @Column(name = "memory_gb")
    private Integer memoryGb;

    @Column(name = "parallel_mode", length = 32)
    private String parallelMode;

    @Column(nullable = false, length = 32)
    private String category;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "is_system")
    private Boolean isSystem = false;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
