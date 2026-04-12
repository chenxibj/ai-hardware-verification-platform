package com.lab.allocation;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * 任务节点分配实体 — 多机任务用
 * #399
 */
@Data
@Entity
@Table(name = "task_node_allocations", uniqueConstraints = @UniqueConstraint(columnNames = {"task_id", "node_id"}))
@NoArgsConstructor
@AllArgsConstructor
public class TaskNodeAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "node_id", nullable = false)
    private Long nodeId;

    @Column(name = "node_rank", nullable = false)
    private Integer nodeRank = 0;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "gpu_indices", columnDefinition = "int[]")
    private Integer[] gpuIndices;

    @Column(name = "status", length = 16)
    private String status = "ALLOCATED";

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "result_summary", columnDefinition = "jsonb")
    private String resultSummary;
}
