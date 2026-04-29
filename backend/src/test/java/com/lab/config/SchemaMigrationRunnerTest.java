package com.lab.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * #548: SchemaMigrationRunner should execute DDL fixes and handle errors gracefully.
 */
class SchemaMigrationRunnerTest {

    @Test
    @DisplayName("#548: Migration runner executes all DDL statements")
    void run_executesAllDdlStatements() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SchemaMigrationRunner runner = new SchemaMigrationRunner(jdbc);

        runner.run();

        // Should execute 10 ALTER statements (4 DROP NOT NULL + 4 SET DEFAULT + 2 DROP NOT NULL)
        verify(jdbc, times(10)).execute(anyString());
    }

    @Test
    @DisplayName("#548: Migration runner handles exceptions gracefully")
    void run_handlesExceptionsGracefully() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        // Simulate column-not-found errors
        doThrow(new RuntimeException("column does not exist")).when(jdbc).execute(anyString());

        SchemaMigrationRunner runner = new SchemaMigrationRunner(jdbc);

        // Should not throw — errors are caught and logged
        assertDoesNotThrow(() -> runner.run());
    }

    @Test
    @DisplayName("#548: Migration runner includes alert_type DROP NOT NULL")
    void run_dropsAlertTypeNotNull() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SchemaMigrationRunner runner = new SchemaMigrationRunner(jdbc);

        runner.run();

        verify(jdbc).execute("ALTER TABLE alerts ALTER COLUMN alert_type DROP NOT NULL");
    }

    @Test
    @DisplayName("#548: Migration runner includes chip_id DROP NOT NULL")
    void run_dropsChipIdNotNull() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SchemaMigrationRunner runner = new SchemaMigrationRunner(jdbc);

        runner.run();

        verify(jdbc).execute("ALTER TABLE evaluation_results ALTER COLUMN chip_id DROP NOT NULL");
    }
}
