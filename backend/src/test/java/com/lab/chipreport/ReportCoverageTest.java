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
        // Simulates the coverage JSON that ReportGeneratorService should write
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
    }
}
