-- Fix dataset_ids column type: text -> bigint[] to match JPA entity definition
-- The column was previously text (likely from an older schema version) but
-- the entity declares it as bigint[] (Long[] with @JdbcTypeCode(SqlTypes.ARRAY))
ALTER TABLE evaluation_tasks ALTER COLUMN dataset_ids TYPE bigint[] USING CASE
    WHEN dataset_ids IS NULL THEN NULL
    WHEN dataset_ids = '' THEN NULL
    ELSE string_to_array(dataset_ids, ',')::bigint[]
END;
