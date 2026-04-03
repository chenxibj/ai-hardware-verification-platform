package com.lab.chipreport;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.Instant;

@Data
@Entity
@Table(name = "chip_reports")
@NoArgsConstructor
public class ChipReport {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "report_no", unique = true, nullable = false, length = 32)
    private String reportNo;

    @Column(name = "chip_id", nullable = false)
    private Long chipId;
    @Column(name = "plan_id", nullable = false)
    private Long planId;

    @Column(name = "overall_score")
    private Double overallScore;

    @Column(name = "dimension_scores", columnDefinition = "jsonb")
    private String dimensionScores;

    @Column(name = "radar_data", columnDefinition = "jsonb")
    private String radarData;

    @Column(name = "bottleneck_analysis", columnDefinition = "text")
    private String bottleneckAnalysis;

    @Column(name = "scenario_recommendations", columnDefinition = "jsonb")
    private String scenarioRecommendations;

    @Column(name = "operator_ranking", columnDefinition = "jsonb")
    private String operatorRanking;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ReportStatus status;

    @Column(name = "created_by")
    private Long createdBy;

    @CreationTimestamp @Column(updatable = false)
    private Instant createdAt;
    @UpdateTimestamp
    private Instant updatedAt;

    public enum ReportStatus { DRAFT, PUBLISHED }
}
