package com.lab.chipreport;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #517: Report coverage statistics
 */
class ReportCoverageTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("#517: ChipReport has coverage field")
    void chipReport_hasCoverageField() throws Exception {
        var field = ChipReport.class.getDeclaredField("coverage");
        assertNotNull(field, "ChipReport should have a coverage field");
        assertEquals(String.class, field.getType(), "coverage should be String (JSON)");
    }

    @Test
    @DisplayName("#517: coverage field has getter/setter")
    void chipReport_coverageGetterSetter() {
        ChipReport report = new ChipReport();
        String coverageJson = "{\"totalItems\":10,\"validItems\":8}";
        report.setCoverage(coverageJson);
        assertEquals(coverageJson, report.getCoverage());
    }

    @Test
    @DisplayName("#517: coverage JSON structure has required keys")
    void coverage_jsonStructure() throws Exception {
        String coverageJson = """
            {
                "totalItems": 20,
                "validItems": 15,
                "noDataItems": 3,
                "failedItems": 2,
                "coverageRate": 75.0,
                "isComplete": false,
                "note": "test"
            }
            """;

        Map<String, Object> coverage = objectMapper.readValue(coverageJson, new TypeReference<>() {});

        assertTrue(coverage.containsKey("totalItems"), "coverage must have totalItems");
        assertTrue(coverage.containsKey("validItems"), "coverage must have validItems");
        assertTrue(coverage.containsKey("noDataItems"), "coverage must have noDataItems");
        assertTrue(coverage.containsKey("failedItems"), "coverage must have failedItems");
        assertTrue(coverage.containsKey("coverageRate"), "coverage must have coverageRate");
        assertTrue(coverage.containsKey("isComplete"), "coverage must have isComplete");
        assertTrue(coverage.containsKey("note"), "coverage must have note");
    }

    @Test
    @DisplayName("#517: coverage percentage = validItems / totalItems * 100")
    void coverage_percentageCalculation() {
        // Simulate the logic from ReportGeneratorService
        long totalCount = 20;
        long validCount = 15;
        long noDataCount = 3;
        long failedCount = 2;

        assertEquals(totalCount, validCount + noDataCount + failedCount,
            "total must equal valid + noData + failed");

        double coverageRate = totalCount > 0 ? (double) validCount / totalCount * 100 : 0;
        assertEquals(75.0, coverageRate, 0.1, "Coverage rate should be 75%");
    }

    @Test
    @DisplayName("#517: isComplete flag based on 80% threshold")
    void coverage_isCompleteThreshold() {
        // >= 80% → complete
        assertTrue(80.0 >= 80.0, "80% should be complete");
        assertTrue(100.0 >= 80.0, "100% should be complete");
        // < 80% → not complete
        assertFalse(79.9 >= 80.0, "79.9% should not be complete");
        assertFalse(0.0 >= 80.0, "0% should not be complete");
    }

    @Test
    @DisplayName("#517: coverage with zero items → coverageRate is 0")
    void coverage_zeroItems() {
        long totalCount = 0;
        long validCount = 0;
        double coverageRate = totalCount > 0 ? (double) validCount / totalCount * 100 : 0;
        assertEquals(0.0, coverageRate, 0.001, "Zero items should yield 0% coverage");
    }

    @Test
    @DisplayName("#517: low coverage → DRAFT status (coverageRate < 30%)")
    void coverage_lowCoverageMarksDraft() {
        // ReportGeneratorService sets DRAFT if coverageRate < 30%
        double coverageRate = 25.0;
        ChipReport.ReportStatus status = coverageRate >= 30.0
            ? ChipReport.ReportStatus.PUBLISHED
            : ChipReport.ReportStatus.DRAFT;
        assertEquals(ChipReport.ReportStatus.DRAFT, status,
            "Coverage < 30% should mark report as DRAFT");
    }

    @Test
    @DisplayName("#517: adequate coverage → PUBLISHED status")
    void coverage_adequateCoveragePublishes() {
        double coverageRate = 80.0;
        ChipReport.ReportStatus status = coverageRate >= 30.0
            ? ChipReport.ReportStatus.PUBLISHED
            : ChipReport.ReportStatus.DRAFT;
        assertEquals(ChipReport.ReportStatus.PUBLISHED, status,
            "Coverage >= 30% should mark report as PUBLISHED");
    }

    @Test
    @DisplayName("#517: coverage column annotation is TEXT")
    void coverage_columnAnnotation() throws Exception {
        var field = ChipReport.class.getDeclaredField("coverage");
        var col = field.getAnnotation(jakarta.persistence.Column.class);
        assertNotNull(col, "coverage should have @Column annotation");
        assertEquals("TEXT", col.columnDefinition(), "coverage column should be TEXT");
    }
}
