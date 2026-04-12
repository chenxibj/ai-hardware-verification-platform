package com.lab.node;

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
 * 计算节点实体
 */
@Data
@Entity
@Table(name = "compute_nodes")
@NoArgsConstructor
@AllArgsConstructor
public class ComputeNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 100)
    private String name;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @Column(name = "agent_port")
    private Integer agentPort;

    @Column(name = "ssh_user", length = 64)
    private String sshUser;

    @Column(name = "ssh_port")
    private Integer sshPort;

    @Column(name = "ssh_auth_type", length = 16)
    private String sshAuthType;

    @Column(name = "ssh_key", columnDefinition = "text")
    private String sshKey;

    @Column(length = 500)
    private String description;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "hardware_info", columnDefinition = "jsonb")
    private String hardwareInfo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.OFFLINE;

    @Column(length = 200)
    private String tags;

    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "env_info", columnDefinition = "jsonb")
    private String envInfo;

    @Column(name = "last_heartbeat")
    private Instant lastHeartbeat;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    @Column(name = "resource_pool_id")
    private Long resourcePoolId;

    /**
     * 关联的 K8s 集群 ID（null 表示非 K8s 节点）
     */
    @Column(name = "cluster_id")
    private Long clusterId;

    /**
     * 节点来源: manual（手动注册）, k8s-daemonset（K8s Agent 自动注册）, k8s-discovery（K8s 节点发现）
     */
    @Column(name = "source", length = 50)
    private String source = "manual";
    /**
     * 芯片型号（例如 "NVIDIA L40S", "Intel Xeon 8269CY"）
     */
    @Column(name = "chip_model", length = 200)
    private String chipModel;

    /**
     * #393: 连续不可达计数（达到阈值后自动标记 OFFLINE）
     */
    @Column(name = "consecutive_unreachable_count")
    private Integer consecutiveUnreachableCount = 0;

    public enum Status {
        ONLINE, OFFLINE, BUSY, ERROR, MAINTENANCE
    }
}
