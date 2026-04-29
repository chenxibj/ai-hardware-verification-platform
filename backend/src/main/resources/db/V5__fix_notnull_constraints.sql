-- ============================================================
-- Fix #548: NOT NULL constraint violations
-- alerts.alert_type and evaluation_results.chip_id
-- ============================================================

-- 1. alerts: Old columns (alert_type, content, severity, title) are from a
--    previous schema version. The current Alert entity uses rule_name, level,
--    message, status instead. Make old columns nullable so JPA inserts don't fail.
ALTER TABLE alerts ALTER COLUMN alert_type DROP NOT NULL;
ALTER TABLE alerts ALTER COLUMN content DROP NOT NULL;
ALTER TABLE alerts ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE alerts ALTER COLUMN title DROP NOT NULL;

-- Set defaults for old columns to avoid confusion
ALTER TABLE alerts ALTER COLUMN alert_type SET DEFAULT 'SYSTEM';
ALTER TABLE alerts ALTER COLUMN content SET DEFAULT '';
ALTER TABLE alerts ALTER COLUMN severity SET DEFAULT 'INFO';
ALTER TABLE alerts ALTER COLUMN title SET DEFAULT '';

-- 2. evaluation_results: chip_id can be null for standalone tasks not
--    associated with any chip (e.g., ad-hoc operator benchmarks).
ALTER TABLE evaluation_results ALTER COLUMN chip_id DROP NOT NULL;

-- 3. evaluation_results: plan_id can also be null for ad-hoc tasks.
--    The entity marks it nullable but the DB column has NOT NULL.
ALTER TABLE evaluation_results ALTER COLUMN plan_id DROP NOT NULL;
