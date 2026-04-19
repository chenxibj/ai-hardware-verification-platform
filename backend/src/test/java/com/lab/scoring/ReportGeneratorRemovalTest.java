package com.lab.scoring;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.lang.reflect.Field;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TDD tests for #516: Verify old ReportGenerator is removed
 * and all references are cleaned up
 */
class ReportGeneratorRemovalTest {

    @Test
    @DisplayName("#516: Old ReportGenerator.java should not exist")
    void oldReportGeneratorDeleted() {
        File file = new File("src/main/java/com/lab/scoring/ReportGenerator.java");
        assertFalse(file.exists(), "Old ReportGenerator.java should have been deleted");
    }

    @Test
    @DisplayName("#516: ReportGenerator class should not be loadable")
    void reportGeneratorClassNotLoadable() {
        assertThrows(ClassNotFoundException.class, () -> {
            Class.forName("com.lab.scoring.ReportGenerator");
        }, "com.lab.scoring.ReportGenerator should no longer exist as a class");
    }

    @Test
    @DisplayName("#516: TaskRecoveryScheduler should not have a ReportGenerator field")
    void taskRecoverySchedulerNoOldRef() throws Exception {
        Class<?> clazz = Class.forName("com.lab.task.TaskRecoveryScheduler");
        for (Field field : clazz.getDeclaredFields()) {
            assertFalse(field.getType().getName().contains("ReportGenerator") 
                        && !field.getType().getName().contains("ReportGeneratorService"),
                "TaskRecoveryScheduler should not have a field of type ReportGenerator (old), found: " + field.getName());
        }
    }

    @Test
    @DisplayName("#516: TaskCompleteController should not have a ReportGenerator field")
    void taskCompleteControllerNoOldRef() throws Exception {
        Class<?> clazz = Class.forName("com.lab.scoring.TaskCompleteController");
        for (Field field : clazz.getDeclaredFields()) {
            assertFalse(field.getType().getName().contains("ReportGenerator") 
                        && !field.getType().getName().contains("ReportGeneratorService"),
                "TaskCompleteController should not have a field of type ReportGenerator (old), found: " + field.getName());
        }
    }

    @Test
    @DisplayName("#516: TaskRecoveryScheduler should have ReportGeneratorService field")
    void taskRecoverySchedulerHasNewService() throws Exception {
        Class<?> clazz = Class.forName("com.lab.task.TaskRecoveryScheduler");
        boolean found = Arrays.stream(clazz.getDeclaredFields())
            .anyMatch(f -> f.getType().getName().equals("com.lab.chipreport.ReportGeneratorService"));
        assertTrue(found, "TaskRecoveryScheduler should have a ReportGeneratorService field");
    }
}
