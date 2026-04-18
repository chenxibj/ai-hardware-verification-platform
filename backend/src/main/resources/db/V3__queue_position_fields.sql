-- #478 P6: Add queue position tracking fields to evaluation_tasks
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS estimated_wait_minutes INTEGER;
ALTER TABLE evaluation_tasks ADD COLUMN IF NOT EXISTS allocated_gpu_indices VARCHAR(200);
