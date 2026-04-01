package com.lab.workflow;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data @Entity @Table(name = "workflows") @NoArgsConstructor
public class Workflow {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "workflow_no", unique = true, nullable = false, length = 64) private String workflowNo;
    @Column(nullable = false, length = 200) private String name;
    @Column(length = 500) private String description;
    @Column(length = 32) private String status = "DRAFT"; // DRAFT, ACTIVE, DISABLED
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private String steps; // [{name,type,config,order}]
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "trigger_config", columnDefinition = "jsonb") private String triggerConfig;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
