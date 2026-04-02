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

    @Column(nullable = false)
    private String password;

    @Column(nullable = false)
    private String role;

    private String avatarUrl;

    private String avatar;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    private Boolean emailVerified;

    private Boolean phoneVerified;

    private Long tenantId;

    private Instant lastLoginAt;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }

    public enum Status {
        ACTIVE, INACTIVE, LOCKED
    }
}
