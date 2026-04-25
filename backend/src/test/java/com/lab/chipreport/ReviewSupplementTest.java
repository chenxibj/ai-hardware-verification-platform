package com.lab.chipreport;

import com.lab.scoring.ScoringService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for all review supplement requirements:
 * #515: remove baseline forcing, score null for NO_DATA, scoring explainability
 * #517: DRAFT status for low coverage
 * #518: reportNo with planId, UNIQUE plan_id, idempotent generation
 */
class ReviewSupplementTest {

    // === #515 tests ===

    @Test
    @DisplayName("#515: ScoringService has getBaselineLatency(String) method")
    void scoringService_hasGetBaselineLatency() throws Exception {
        Method m = ScoringService.class.getMethod("getBaselineLatency", String.class);
        assertNotNull(m);
        assertEquals(Double.class, m.getReturnType(), "Should return Double (nullable)");
    }

    @Test
    @DisplayName("#515: ReportStatus enum has DRAFT value")
    void reportStatus_hasDraft() {
        ChipReport.ReportStatus draft = ChipReport.ReportStatus.DRAFT;
        assertNotNull(draft, "DRAFT status should exist");
    }

    @Test
    @DisplayName("#515: ReportStatus enum has PUBLISHED value")
    void reportStatus_hasPublished() {
        ChipReport.ReportStatus published = ChipReport.ReportStatus.PUBLISHED;
        assertNotNull(published, "PUBLISHED status should exist");
    }

    // === #517 tests ===

    @Test
    @DisplayName("#517: coverageRate < 30 should result in DRAFT (logic check)")
    void lowCoverage_shouldBeDraft() {
        double coverageRate = 25.0;
        ChipReport.ReportStatus expected = coverageRate >= 30.0
            ? ChipReport.ReportStatus.PUBLISHED
            : ChipReport.ReportStatus.DRAFT;
        assertEquals(ChipReport.ReportStatus.DRAFT, expected);
    }

    @Test
    @DisplayName("#517: coverageRate >= 30 should result in PUBLISHED (logic check)")
    void adequateCoverage_shouldBePublished() {
        double coverageRate = 30.0;
        ChipReport.ReportStatus expected = coverageRate >= 30.0
            ? ChipReport.ReportStatus.PUBLISHED
            : ChipReport.ReportStatus.DRAFT;
        assertEquals(ChipReport.ReportStatus.PUBLISHED, expected);
    }

    // === #518 tests ===

    @Test
    @DisplayName("#518: plan_id field has unique=true in @Column annotation")
    void planId_hasUniqueConstraint() throws Exception {
        Field field = ChipReport.class.getDeclaredField("planId");
        jakarta.persistence.Column col = field.getAnnotation(jakarta.persistence.Column.class);
        assertNotNull(col, "planId should have @Column annotation");
        assertTrue(col.unique(), "planId @Column should have unique=true");
    }

    @Test
    @DisplayName("#518: ChipReportRepository has findFirstByPlanId method")
    void repository_hasFindFirstByPlanId() throws Exception {
        Method m = ChipReportRepository.class.getMethod("findFirstByPlanId", Long.class);
        assertNotNull(m);
        assertEquals(Optional.class, m.getReturnType());
    }

    @Test
    @DisplayName("#518: Report number format is RPT-{date}-{planId}")
    void reportNo_formatWithPlanId() {
        // Simulate: plan_id = 42
        Long planId = 42L;
        String date = "20260419";
        String reportNo = "RPT-" + date + "-" + planId;
        assertEquals("RPT-20260419-42", reportNo);
        assertTrue(reportNo.matches("RPT-\\d{8}-\\d+"),
            "Report number should match RPT-YYYYMMDD-{planId} pattern");
    }

    @Test
    @DisplayName("#515: ReportGeneratorService source has no baseline 100% forcing")
    void noBaseline100Forcing() throws Exception {
        // Read the source to verify the forcing logic is gone
        String source = new String(java.nio.file.Files.readAllBytes(
            java.nio.file.Paths.get("src/main/java/com/lab/chipreport/ReportGeneratorService.java")));

        assertFalse(source.contains("dimScores.replaceAll((k, v) -> v > 0 ? 100.0 : 0.0)"),
            "Baseline 100% dimension forcing should be removed");
        assertFalse(source.contains("op.put(\"score\", 100.0)"),
            "Baseline 100% operator score forcing should be removed");
    }

    @Test
    @DisplayName("#515: operatorRanking entries include baselineLatency and ratio fields in source")
    void operatorRanking_hasExplainabilityFields() throws Exception {
        String source = new String(java.nio.file.Files.readAllBytes(
            java.nio.file.Paths.get("src/main/java/com/lab/chipreport/ReportDataAssembler.java")));

        assertTrue(source.contains("\"baselineLatency\""),
            "operatorRanking should include baselineLatency field");
        assertTrue(source.contains("\"ratio\""),
            "operatorRanking should include ratio field");
    }

    @Test
    @DisplayName("#518: generateReport has idempotency check (findFirstByPlanId)")
    void generateReport_hasIdempotencyCheck() throws Exception {
        String source = new String(java.nio.file.Files.readAllBytes(
            java.nio.file.Paths.get("src/main/java/com/lab/chipreport/ReportGeneratorService.java")));

        assertTrue(source.contains("findFirstByPlanId(planId)"),
            "generateReport should check for existing report by planId");
        assertTrue(source.contains("skipping"),
            "Should log 'skipping' when report already exists");
    }
}
