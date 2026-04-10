package com.lab.k8s;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;

/**
 * K8s 集群实体
 */
@Data
@Entity
@Table(name = "k8s_clusters")
@NoArgsConstructor
@AllArgsConstructor
public class K8sCluster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200, unique = true)
    private String name;

    /**
     * kubeconfig 内容（敏感信息）
     * 写入时接收，读取时不返回（除了详情接口返回脱敏版本）
     */
    @Column(columnDefinition = "TEXT", nullable = false)
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String kubeconfig;

    @Column(length = 50)
    private String status = "REGISTERING";

    @Column(name = "node_count")
    private Integer nodeCount = 0;

    @Column(name = "online_count")
    private Integer onlineCount = 0;

    @Column(name = "api_server_url", length = 500)
    private String apiServerUrl;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // Status constants
    public static final String STATUS_REGISTERING = "REGISTERING";
    public static final String STATUS_DEPLOYING = "DEPLOYING";
    public static final String STATUS_DISCOVERING = "DISCOVERING";
    public static final String STATUS_READY = "READY";
    public static final String STATUS_ERROR = "ERROR";
}
