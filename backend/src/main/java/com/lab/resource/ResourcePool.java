package com.lab.resource;

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
 * 资源池实体
 * #395: 扩展 chipModel, provider, clusterId, gpuPerNode, schedulingPolicy 等字段
 */
@Data
@Entity
@Table(name = "resource_pools")
@NoArgsConstructor
@AllArgsConstructor
public class ResourcePool {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(nullable = false, length = 32)
    private String type;

    private String description;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String capacity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.ACTIVE;

    @Column(name = "chip_model", length = 200)
    private String chipModel;

    @Column(name = "provider", length = 32)
    private String provider = "bare-metal";

    @Column(name = "cluster_id")
    private Long clusterId;

    @Column(name = "gpu_per_node")
    private Integer gpuPerNode;

    @Column(name = "scheduling_policy", length = 32)
    private String schedulingPolicy = "least_loaded";

    @Column(name = "max_concurrent_tasks")
    private Integer maxConcurrentTasks = 0;

    @Column(name = "priority")
    private Integer priority = 0;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public enum Status {
        ACTIVE, INACTIVE, MAINTENANCE
    }
}
