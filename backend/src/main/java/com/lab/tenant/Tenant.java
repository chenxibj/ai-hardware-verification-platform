package com.lab.tenant;

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
 * 租户实体
 */
@Data
@Entity
@Table(name = "tenants")
@NoArgsConstructor
@AllArgsConstructor
public class Tenant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 128)
    private String name;

    private String description;

    @Column(unique = true, length = 50)
    private String code;

    @Column(name = "contact_email")
    private String contactEmail;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "resource_quota", columnDefinition = "jsonb")
    private String resourceQuota;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.ACTIVE;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public enum Status {
        ACTIVE, INACTIVE, SUSPENDED
    }
}
