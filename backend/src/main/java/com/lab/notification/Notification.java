package com.lab.notification;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;

@Data @Entity @Table(name = "notifications") @NoArgsConstructor
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Column(nullable = false, length = 200) private String title;
    @Column(columnDefinition = "text") private String content;
    @Column(name = "notify_type", length = 32) private String notifyType = "SYSTEM"; // SYSTEM, TASK, REPORT, COMMUNITY
    @Column(name = "is_read") private Boolean isRead = false;
    @Column(name = "ref_type", length = 32) private String refType; // TASK, REPORT, ARTICLE
    @Column(name = "ref_id") private Long refId;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
