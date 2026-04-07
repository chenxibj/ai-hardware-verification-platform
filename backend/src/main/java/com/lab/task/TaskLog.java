package com.lab.task;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * 任务执行日志（实时流式日志）
 * #224 / #225
 */
@Data
@Entity
@Table(name = "task_logs", indexes = {
    @Index(name = "idx_task_logs_task_id", columnList = "task_id")
})
@NoArgsConstructor
public class TaskLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "content", columnDefinition = "text")
    private String content;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    /**
     * 简单构造器 — 用于 Agent 日志上报
     */
    public TaskLog(Long taskId, String content) {
        this.taskId = taskId;
        this.content = content;
    }

    /**
     * 兼容旧版（level + message + details）— 用于 TaskCompleteController
     */
    public TaskLog(Long taskId, String level, String message, String details) {
        this.taskId = taskId;
        this.content = String.format("[%s] %s\n%s", level, message, details != null ? details : "");
    }
}
