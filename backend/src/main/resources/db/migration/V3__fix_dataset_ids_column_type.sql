-- Fix dataset_ids column type: text -> bigint[] to match JPA entity definition
-- The column was previously text (likely from an older schema version) but
-- the entity declares it as bigint[] (Long[] with @JdbcTypeCode(SqlTypes.ARRAY))
--
-- Defensive: only alter if the column is currently text type (not bigint[]).
-- On a fresh deploy with V1 baseline, dataset_ids is already bigint[], so this is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evaluation_tasks'
      AND column_name = 'dataset_ids'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE evaluation_tasks ALTER COLUMN dataset_ids TYPE bigint[]
      USING CASE
        WHEN dataset_ids IS NULL THEN NULL
        WHEN dataset_ids = '' THEN NULL
        ELSE string_to_array(dataset_ids, ',')::bigint[]
      END;
  END IF;
END $$;
