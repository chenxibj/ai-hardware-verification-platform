package com.lab.scoring;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #523: Verify TaskCompleteController deprecation markers
 */
class TaskCompleteDeprecationTest {

    @Test
    @DisplayName("#523: TaskCompleteController has @Deprecated annotation")
    void classIsDeprecated() {
        assertTrue(TaskCompleteController.class.isAnnotationPresent(Deprecated.class),
                "TaskCompleteController should be @Deprecated");
    }

    @Test
    @DisplayName("#523: completeTask method has @Deprecated annotation")
    void methodIsDeprecated() throws Exception {
        Method method = null;
        for (Method m : TaskCompleteController.class.getDeclaredMethods()) {
            if ("completeTask".equals(m.getName())) {
                method = m;
                break;
            }
        }
        assertNotNull(method, "completeTask method should exist");
        assertTrue(method.isAnnotationPresent(Deprecated.class),
                "completeTask should be @Deprecated");
    }

    @Test
    @DisplayName("#523: Controller has returnGone feature flag field")
    void hasReturnGoneField() throws Exception {
        var field = TaskCompleteController.class.getDeclaredField("returnGone");
        assertNotNull(field, "returnGone feature flag field should exist");
        assertEquals(boolean.class, field.getType());
    }

    @Test
    @DisplayName("#523: DEPRECATION_WARNING constant exists")
    void hasDeprecationWarningConstant() throws Exception {
        var field = TaskCompleteController.class.getDeclaredField("DEPRECATION_WARNING");
        field.setAccessible(true);
        // Static field, get from null
        String value = (String) field.get(null);
        assertTrue(value.contains("Deprecated"), "Warning should contain 'Deprecated'");
        assertTrue(value.contains("/api/tasks/{id}/result"), "Warning should reference new endpoint");
    }
}
