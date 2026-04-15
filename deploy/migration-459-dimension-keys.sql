-- #459: Migrate Chinese dimension names to English keys in chip_reports
-- Run ONCE after deploying Phase 1-9

-- 1. operator_ranking: "dimension": "计算" → "dimension": "compute"
UPDATE chip_reports SET operator_ranking = 
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    operator_ranking::text,
    '"dimension": "计算"', '"dimension": "compute"'),
    '"dimension": "访存"', '"dimension": "memory"'),
    '"dimension": "通信"', '"dimension": "communication"'),
    '"dimension": "算子兼容"', '"dimension": "op_compat"'),
    '"dimension": "训练"', '"dimension": "training"'),
    '"dimension": "推理"', '"dimension": "inference"'),
    '"dimension": "扩展性"', '"dimension": "scalability"'),
    '"dimension": "生态"', '"dimension": "ecosystem"')::jsonb
WHERE operator_ranking IS NOT NULL;

-- 2. training_summary dimension field
UPDATE chip_reports SET 
  training_summary = REPLACE(training_summary::text, '"dimension": "训练"', '"dimension": "training"')::jsonb
WHERE training_summary IS NOT NULL AND training_summary::text LIKE '%"dimension": "训练"%';

-- 3. inference_summary dimension field
UPDATE chip_reports SET 
  inference_summary = REPLACE(inference_summary::text, '"dimension": "推理"', '"dimension": "inference"')::jsonb
WHERE inference_summary IS NOT NULL AND inference_summary::text LIKE '%"dimension": "推理"%';

-- Verify no Chinese dimension keys remain
SELECT 'operator_ranking' AS field, COUNT(*) AS remaining
FROM chip_reports
WHERE operator_ranking IS NOT NULL
  AND (operator_ranking::text LIKE '%"dimension": "计算"%'
    OR operator_ranking::text LIKE '%"dimension": "访存"%'
    OR operator_ranking::text LIKE '%"dimension": "推理"%')
UNION ALL
SELECT 'training_summary', COUNT(*)
FROM chip_reports
WHERE training_summary IS NOT NULL AND training_summary::text LIKE '%"dimension": "训练"%'
UNION ALL
SELECT 'inference_summary', COUNT(*)
FROM chip_reports
WHERE inference_summary IS NOT NULL AND inference_summary::text LIKE '%"dimension": "推理"%';
