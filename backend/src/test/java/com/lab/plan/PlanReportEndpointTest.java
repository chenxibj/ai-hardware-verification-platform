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
    @DisplayName("#501: XSS script tag should be rejected by validateName")
    void xssScriptTag_rejected() {
        String error = XssUtils.validateName("<script>alert('xss')</script>", "名称", 100);
        assertNotNull(error);
        assertEquals("名称包含非法字符", error);
    }

    @Test
    @DisplayName("#501: Normal Chinese name should pass validation")
    void normalChineseName_passes() {
        String error = XssUtils.validateName("测试评测计划-01", "名称", 100);
        assertNull(error);
    }

    @Test
    @DisplayName("#501: img onerror should be rejected by validateName")
    void imgOnerror_rejected() {
        String error = XssUtils.validateName("<img src=x onerror=alert(1)>", "名称", 100);
        assertNotNull(error);
        assertEquals("名称包含非法字符", error);
    }

    @Test
    @DisplayName("#501: Name with parens should pass validation")
    void nameWithParens_passes() {
        String error = XssUtils.validateName("性能测试(第一批)", "名称", 100);
        assertNull(error);
    }

    @Test
    @DisplayName("#501: Full-width parens should pass validation")
    void nameWithFullWidthParens_passes() {
        String error = XssUtils.validateName("芯片A（批次2）", "名称", 100);
        assertNull(error);
    }

    @Test
    @DisplayName("#501: Empty name should be rejected")
    void emptyName_rejected() {
        String error = XssUtils.validateName("", "名称", 100);
        assertNotNull(error);
        assertEquals("名称不能为空", error);
    }

    @Test
    @DisplayName("#501: Null name should be rejected")
    void nullName_rejected() {
        String error = XssUtils.validateName(null, "名称", 100);
        assertNotNull(error);
        assertEquals("名称不能为空", error);
    }

    @Test
    @DisplayName("#501: Too long name (200 chars) should be rejected")
    void tooLongName_rejected() {
        String longName = "A".repeat(200);
        String error = XssUtils.validateName(longName, "名称", 100);
        assertNotNull(error);
        assertEquals("名称长度不能超过100个字符", error);
    }

    @Test
    @DisplayName("#501: English alphanumeric name should pass")
    void englishName_passes() {
        String error = XssUtils.validateName("Performance Test_01", "名称", 100);
        assertNull(error);
    }

    @Test
    @DisplayName("#501: Description with XSS should be rejected by validateText")
    void descriptionXss_rejected() {
        String error = XssUtils.validateText("<script>evil()</script>", "描述", 500);
        assertNotNull(error);
        assertEquals("描述包含非法字符", error);
    }

    @Test
    @DisplayName("#501: Null description should pass (optional field)")
    void nullDescription_passes() {
        String error = XssUtils.validateText(null, "描述", 500);
        assertNull(error);
    }
}
