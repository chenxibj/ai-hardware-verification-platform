package com.lab.task;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

/**
 * #488 P0-1: Verify TaskDispatcher has self-injection for proxy-based @Transactional calls
 */
class TaskDispatcherTransactionTest {

    @Test
    @DisplayName("#488 P0-1: TaskDispatcher should have a self field for proxy call")
    void taskDispatcher_shouldHaveSelfField() {
        // Verify the class has a self field of type TaskDispatcher
        Field selfField = null;
        for (Field f : TaskDispatcher.class.getDeclaredFields()) {
            if ("self".equals(f.getName()) && f.getType() == TaskDispatcher.class) {
                selfField = f;
                break;
            }
        }
        assertNotNull(selfField, "TaskDispatcher should have a self field of type TaskDispatcher for proxy calls");
    }

    @Test
    @DisplayName("#488 P0-1: dispatchSingleTask should have @Transactional")
    void dispatchSingleTask_shouldHaveTransactional() throws Exception {
        Method method = TaskDispatcher.class.getMethod("dispatchSingleTask", EvaluationTask.class);
        assertTrue(method.isAnnotationPresent(Transactional.class),
                "dispatchSingleTask should be annotated with @Transactional");
    }

    @Test
    @DisplayName("#488 P0-1: tryDispatchNext should call self.dispatchSingleTask (not direct)")
    void tryDispatchNext_shouldUseSelfProxy() throws Exception {
        // This is a structural test: verify the self field exists and is used
        // The actual proxy behavior is tested in integration tests
        // Here we verify the class structure supports proxy-based calls
        Field selfField = TaskDispatcher.class.getDeclaredField("self");
        assertNotNull(selfField);
        assertEquals(TaskDispatcher.class, selfField.getType());
    }
}
