package com.lab.audit;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;

@Data @Entity @Table(name = "audit_logs") @NoArgsConstructor
public class AuditLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "user_id") private Long userId;
    @Column(name = "username", length = 50) private String username;
    @Column(name = "action", nullable = false, length = 50) private String action; // CREATE, UPDATE, DELETE, LOGIN, LOGOUT, EXPORT
    @Column(name = "resource_type", length = 50) private String resourceType; // TASK, REPORT, ASSET, USER, RESOURCE
    @Column(name = "resource_id") private Long resourceId;
    @Column(name = "detail", columnDefinition = "text") private String detail;
    @Column(name = "ip_address", length = 50) private String ipAddress;
    @Column(name = "user_agent", length = 500) private String userAgent;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
