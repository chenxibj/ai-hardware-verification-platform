#!/bin/bash
# 清理 BDD/E2E/CI 测试产生的垃圾数据
# 只删除名称明确是测试框架自动生成的数据
# 不删除手工创建的正常数据

set -e

CONTAINER=ahvp-postgres
DB_USER=ahvp
DB_NAME=ahvp

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning up test data..."

docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "
  DELETE FROM evaluation_results WHERE plan_id IN (SELECT id FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%' OR name LIKE 'CI-%');
  DELETE FROM chip_reports WHERE plan_id IN (SELECT id FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%' OR name LIKE 'CI-%');
  DELETE FROM task_logs WHERE task_id IN (SELECT id FROM evaluation_tasks WHERE plan_id IN (SELECT id FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%' OR name LIKE 'CI-%'));
  DELETE FROM evaluation_tasks WHERE plan_id IN (SELECT id FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%' OR name LIKE 'CI-%');
  DELETE FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%' OR name LIKE 'CI-%';
  DELETE FROM chips WHERE name LIKE 'BDD-%' OR name LIKE 'SearchTest-%' OR name LIKE 'TypeTest-%' OR name LIKE 'T152-%' OR name LIKE 'T153%' OR name LIKE 'E2E-%' OR name LIKE 'QuickDebug-%' OR name LIKE 'SpecChip-%' OR name LIKE 'VendorAlias-%' OR name LIKE 'TechSpec-%' OR name LIKE 'FieldTest-%' OR name LIKE 'Dim-Test-%' OR name LIKE 'CI-%';
  DELETE FROM task_templates WHERE is_system = false AND (name LIKE 'BDD%' OR name LIKE 'CI-%');
  DELETE FROM compute_nodes WHERE name LIKE 'BDD-%';
"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleanup done."
