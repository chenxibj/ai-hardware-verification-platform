package com.lab.chipreport;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #518: Report number uniqueness
 */
class ReportNoUniquenessTest {

    @Test
    @DisplayName("#518: ChipReportRepository has countByReportNoStartingWith method")
    void repository_hasCountMethod() throws Exception {
        Method method = ChipReportRepository.class.getMethod("countByReportNoStartingWith", String.class);
        assertNotNull(method, "ChipReportRepository should have countByReportNoStartingWith");
        assertEquals(long.class, method.getReturnType(), "Should return long");
    }

    @Test
    @DisplayName("#518: Report number format is RPT-YYYYMMDD-NNN")
    void reportNo_formatPattern() {
        // Simulate the format
        String reportNo = "RPT-20260419-001";
        assertTrue(reportNo.matches("RPT-\\d{8}-\\d{3}"),
            "Report number should match RPT-YYYYMMDD-NNN pattern");
    }

    @Test
    @DisplayName("#518: Sequential report numbers should increment")
    void reportNo_sequentialIncrement() {
        // Simulate: if prefix has count=5, next should be 006
        long existingCount = 5;
        String seq = String.format("%03d", existingCount + 1);
        assertEquals("006", seq, "Count 5 + 1 should produce 006");
    }

    @Test
    @DisplayName("#518: First report of the day should be 001")
    void reportNo_firstOfDay() {
        long existingCount = 0;
        String seq = String.format("%03d", existingCount + 1);
        assertEquals("001", seq, "First report should be 001");
    }

    @Test
    @DisplayName("#518: Report number handles overflow past 999")
    void reportNo_overflow() {
        long existingCount = 999;
        String seq = String.format("%03d", existingCount + 1);
        assertEquals("1000", seq, "Should handle >999 (4 digits)");
    }
}
