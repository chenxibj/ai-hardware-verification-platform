package com.lab.comparison;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Data @Entity @Table(name = "comparison_records") @NoArgsConstructor
public class ComparisonRecord {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "comparison_no", unique = true, nullable = false, length = 64) private String comparisonNo;
    @Column(nullable = false, length = 200) private String title;
    @Column(length = 500) private String description;
    @Column(name = "report_ids", length = 500) private String reportIds; // comma-separated
    @Column(name = "compare_type", length = 32) private String compareType; // REPORT, EXPERIMENT, CROSS_PLATFORM
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "comparison_result", columnDefinition = "jsonb") private String comparisonResult;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "chart_config", columnDefinition = "jsonb") private String chartConfig;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
