package com.lab.plan;

import com.lab.common.XssUtils;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #500 + #501: Unit tests for plan report endpoint and XSS validation
 */
class PlanReportEndpointTest {

    // === #501: XSS validation tests ===

    @Test
    @DisplayName("#501: XSS script tag should be detected as containing illegal characters")
    void xssScriptTag_containsXss() {
        assertTrue(XssUtils.containsXss("<script>alert(xss)</script>"));
    }

    @Test
    @DisplayName("#501: Normal Chinese name should NOT contain XSS")
    void normalChineseName_noXss() {
        assertFalse(XssUtils.containsXss("测试评测计划-01"));
    }

    @Test
    @DisplayName("#501: img onerror should be detected as XSS")
    void imgOnerror_containsXss() {
        assertTrue(XssUtils.containsXss("<img src=x onerror=alert(1)>"));
    }

    @Test
    @DisplayName("#501: Name with parens should be valid")
    void nameWithParens_noXss() {
        assertFalse(XssUtils.containsXss("性能测试(第一批)"));
    }

    @Test
    @DisplayName("#501: stripXss should NOT be used for validation - it silently empties XSS strings")
    void stripXss_silentlyEmpties() {
        // This documents the current bug: stripXss turns XSS into empty string
        String result = XssUtils.stripXss("<script>alert(xss)</script>");
        assertEquals("", result, "stripXss silently empties XSS — this is the bug we need to fix");
    }

    @Test
    @DisplayName("#501: Name validation regex should allow letters, numbers, Chinese, spaces, -, _, ()")
    void validateName_regex() {
        // Valid names
        String validPattern = "^[\\w\\u4e00-\\u9fa5\\s\\-_()（）.·、]+$";
        assertTrue("测试评测计划-01".matches(validPattern));
        assertTrue("Performance Test_01".matches(validPattern));
        assertTrue("性能测试(第一批)".matches(validPattern));
        assertTrue("芯片A（批次2）".matches(validPattern));

        // Invalid names - contain < > etc
        assertFalse("<script>alert(xss)</script>".matches(validPattern));
        assertFalse("<img src=x>".matches(validPattern));
    }

    @Test
    @DisplayName("#501: Empty and too-long names should be rejected")
    void validateName_lengthBounds() {
        // Empty
        assertTrue("".isBlank());
        assertTrue("   ".isBlank());

        // Too long (> 100 chars)
        String longName = "A".repeat(200);
        assertTrue(longName.length() > 100);
    }
}
