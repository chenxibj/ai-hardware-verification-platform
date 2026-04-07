package com.lab.task;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.Instant;

/**
 * 任务执行日志（实时流式日志）
 * #224 / #225 / #229
 */
@Data
@Entity
@Table(name = "task_logs", indexes = {
    @Index(name = "idx_task_logs_task_id", columnList = "task_id"),
    @Index(name = "idx_logs_type", columnList = "log_type"),
    @Index(name = "idx_logs_level", columnList = "level")
})
@NoArgsConstructor
public class TaskLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "level", length = 16)
    private String level = "INFO";

    @Column(name = "message", columnDefinition = "text")
    private String message;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details", columnDefinition = "jsonb")
    private String details;

    @Column(name = "content", columnDefinition = "text")
    private String content;

    @Column(name = "log_type", length = 16)
    private String logType = "TEXT";

    @JsonRawValue
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metrics", columnDefinition = "jsonb")
    private String metrics;

    @JsonRawValue
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "context", columnDefinition = "jsonb")
    private String context;

    @Column(name = "source", length = 32)
    private String source = "AGENT";

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    /**
     * 简单构造器 — 用于 Agent 日志上报
     */
    public TaskLog(Long taskId, String content) {
        this.taskId = taskId;
        this.content = content;
        this.message = content;
    }

    /**
     * 兼容旧版（level + message + details）— 用于 TaskCompleteController
     */
    public TaskLog(Long taskId, String level, String message, String details) {
        this.taskId = taskId;
        this.level = level;
        this.message = message;
        this.content = String.format("[%s] %s\n%s", level, message, details != null ? details : "");
    }
}
