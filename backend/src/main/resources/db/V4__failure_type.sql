-- #524: Add failure_type column to evaluation_tasks
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS failure_type VARCHAR(32);
