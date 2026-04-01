package com.lab.alert;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;

@Data @Entity @Table(name = "alerts") @NoArgsConstructor
public class Alert {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "alert_type", nullable = false, length = 32) private String alertType;
    @Column(nullable = false, length = 16) private String severity = "WARNING";
    @Column(nullable = false, length = 256) private String title;
    @Column(nullable = false, columnDefinition = "text") private String content;
    @Column(name = "task_id") private Long taskId;
    @Column(name = "user_id") private Long userId;
    @Column(name = "is_read") private Boolean isRead = false;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @Column(name = "read_at") private Instant readAt;
}
