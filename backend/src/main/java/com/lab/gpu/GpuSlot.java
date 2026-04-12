package com.lab.gpu;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.Instant;

/**
 * GPU Slot 实体 — 追踪每个节点上每张 GPU 的使用状态
 * #396
 */
@Data
@Entity
@Table(name = "gpu_slots", uniqueConstraints = @UniqueConstraint(columnNames = {"node_id", "gpu_index"}))
@NoArgsConstructor
@AllArgsConstructor
public class GpuSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "node_id", nullable = false)
    private Long nodeId;

    @Column(name = "gpu_index", nullable = false)
    private Integer gpuIndex;

    @Column(name = "gpu_model", length = 200)
    private String gpuModel;

    @Column(name = "gpu_memory_gb")
    private Integer gpuMemoryGb;

    @Column(name = "status", nullable = false, length = 16)
    private String status = "FREE";

    @Column(name = "allocated_task_id")
    private Long allocatedTaskId;

    @Column(name = "allocated_at")
    private Instant allocatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version = 0L;
}
