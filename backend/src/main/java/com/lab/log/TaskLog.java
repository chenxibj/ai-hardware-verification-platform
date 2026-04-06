package com.lab.log;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

/**
 * 评测任务执行日志实体
 */
@Data
@Entity
@Table(name = "task_logs")
@NoArgsConstructor
public class TaskLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "level", nullable = false, length = 16)
    private String level;

    @Column(name = "message", nullable = false, columnDefinition = "text")
    private String message;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details", columnDefinition = "jsonb")
    private String details;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    public TaskLog(Long taskId, String level, String message) {
        this.taskId = taskId;
        this.level = level;
        this.message = message;
    }

    public TaskLog(Long taskId, String level, String message, String details) {
        this.taskId = taskId;
        this.level = level;
        this.message = message;
        this.details = details;
    }
}
