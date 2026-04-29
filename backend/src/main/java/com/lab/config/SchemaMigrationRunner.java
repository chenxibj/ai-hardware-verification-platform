package com.lab.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Lightweight schema migration runner.
 * Runs idempotent DDL fixes on startup (after Hibernate ddl-auto: update).
 * #548: Fix NOT NULL constraints on legacy/mismatched columns.
 */
@Slf4j
@Component
@Order(1) // Run before DataInitializer
@RequiredArgsConstructor
public class SchemaMigrationRunner implements CommandLineRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        log.info("#548: Running schema migration fixes...");

        // --- alerts: legacy columns from old schema are NOT NULL but current entity doesn't use them ---
        safeAlter("ALTER TABLE alerts ALTER COLUMN alert_type DROP NOT NULL");
        safeAlter("ALTER TABLE alerts ALTER COLUMN content DROP NOT NULL");
        safeAlter("ALTER TABLE alerts ALTER COLUMN severity DROP NOT NULL");
        safeAlter("ALTER TABLE alerts ALTER COLUMN title DROP NOT NULL");
        // Set sensible defaults for legacy columns
        safeAlter("ALTER TABLE alerts ALTER COLUMN alert_type SET DEFAULT 'SYSTEM'");
        safeAlter("ALTER TABLE alerts ALTER COLUMN content SET DEFAULT ''");
        safeAlter("ALTER TABLE alerts ALTER COLUMN severity SET DEFAULT 'INFO'");
        safeAlter("ALTER TABLE alerts ALTER COLUMN title SET DEFAULT ''");

        // --- evaluation_results: chip_id and plan_id can be null for ad-hoc tasks ---
        safeAlter("ALTER TABLE evaluation_results ALTER COLUMN chip_id DROP NOT NULL");
        safeAlter("ALTER TABLE evaluation_results ALTER COLUMN plan_id DROP NOT NULL");

        log.info("#548: Schema migration fixes complete.");
    }

    private void safeAlter(String ddl) {
        try {
            jdbc.execute(ddl);
        } catch (Exception e) {
            // Column might not exist or constraint already dropped — that's fine
            log.debug("Schema migration skipped: {} — {}", ddl, e.getMessage());
        }
    }
}
