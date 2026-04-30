-- #548: Fix NOT NULL constraints on legacy/mismatched columns
-- Previously handled by SchemaMigrationRunner.java at runtime

-- alerts: legacy columns from old schema are NOT NULL but current entity doesn't use them
ALTER TABLE alerts ALTER COLUMN alert_type DROP NOT NULL;
ALTER TABLE alerts ALTER COLUMN content DROP NOT NULL;
ALTER TABLE alerts ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE alerts ALTER COLUMN title DROP NOT NULL;

-- Set sensible defaults for legacy columns
ALTER TABLE alerts ALTER COLUMN alert_type SET DEFAULT 'SYSTEM';
ALTER TABLE alerts ALTER COLUMN content SET DEFAULT '';
ALTER TABLE alerts ALTER COLUMN severity SET DEFAULT 'INFO';
ALTER TABLE alerts ALTER COLUMN title SET DEFAULT '';

-- evaluation_results: chip_id and plan_id can be null for ad-hoc tasks
ALTER TABLE evaluation_results ALTER COLUMN chip_id DROP NOT NULL;
ALTER TABLE evaluation_results ALTER COLUMN plan_id DROP NOT NULL;
