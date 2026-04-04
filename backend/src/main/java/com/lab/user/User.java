package com.lab.user;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

@Data
@Entity
@Table(name = "users")
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String username;

    @Column(unique = true, nullable = false)
    private String email;

    private String phone;

    @Column(name = "password_hash", nullable = false)
    private String password;

    @Column(name = "user_type", nullable = false)
    private String role;

    private String organization;

    private String avatarUrl;

    private String avatar;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    private Boolean emailVerified;

    private Boolean phoneVerified;

    private Long tenantId;

    private Instant lastLoginAt;

    @Column(name = "failed_attempts")
    private Integer failedAttempts = 0;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public boolean isAdmin() {
        return "ADMIN".equals(role) || "SUPER_ADMIN".equals(role);
    }

    public boolean isLocked() {
        return lockedUntil != null && Instant.now().isBefore(lockedUntil);
    }

    public enum Status {
        ACTIVE, INACTIVE, LOCKED
    }
}
