package com.lab.system;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Field;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class VersionControllerTest {

    private VersionController controller;

    @BeforeEach
    void setUp() throws Exception {
        controller = new VersionController();
        setField(controller, "version", "1.0.0-test");
        setField(controller, "gitCommit", "abc1234");
        setField(controller, "buildTime", "2026-05-01T00:00:00Z");
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    @Test
    void versionEndpointReturnsAllRequiredFields() {
        Map<String, String> result = controller.version();
        assertNotNull(result);
        assertTrue(result.containsKey("version"), "missing 'version'");
        assertTrue(result.containsKey("gitCommit"), "missing 'gitCommit'");
        assertTrue(result.containsKey("buildTime"), "missing 'buildTime'");
        assertTrue(result.containsKey("javaVersion"), "missing 'javaVersion'");
        assertTrue(result.containsKey("springBootVersion"), "missing 'springBootVersion'");
        assertEquals(5, result.size(), "should have exactly 5 fields");
    }

    @Test
    void injectedFieldsAreReturned() {
        Map<String, String> result = controller.version();
        assertEquals("1.0.0-test", result.get("version"));
        assertEquals("abc1234", result.get("gitCommit"));
        assertEquals("2026-05-01T00:00:00Z", result.get("buildTime"));
    }

    @Test
    void javaVersionIsRealValue() {
        Map<String, String> result = controller.version();
        String javaVersion = result.get("javaVersion");
        assertNotNull(javaVersion);
        assertNotEquals("unknown", javaVersion);
        assertNotEquals("", javaVersion);
        assertTrue(javaVersion.matches(".*\\d+.*"), "javaVersion should contain digits: " + javaVersion);
    }

    @Test
    void springBootVersionIsRealValue() {
        Map<String, String> result = controller.version();
        String sbVersion = result.get("springBootVersion");
        assertNotNull(sbVersion);
        assertNotEquals("unknown", sbVersion);
        assertNotEquals("", sbVersion);
        assertTrue(sbVersion.matches("\\d+\\.\\d+\\..*"), "springBootVersion should be semver-like: " + sbVersion);
    }

    @Test
    void allFieldsAreNonNull() {
        Map<String, String> result = controller.version();
        for (Map.Entry<String, String> e : result.entrySet()) {
            assertNotNull(e.getValue(), e.getKey() + " is null");
            assertFalse(e.getValue().isEmpty(), e.getKey() + " is empty");
        }
    }
}
