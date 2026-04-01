package com.lab.log;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import java.time.Instant;

@Data @Entity @Table(name = "eval_logs") @NoArgsConstructor
public class EvalLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "task_id") private Long taskId;
    @Column(name = "log_level", length = 16) private String logLevel = "INFO"; // INFO, WARN, ERROR, DEBUG
    @Column(columnDefinition = "text") private String message;
    @Column(length = 200) private String source;
    @Column(name = "step_name", length = 100) private String stepName;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
