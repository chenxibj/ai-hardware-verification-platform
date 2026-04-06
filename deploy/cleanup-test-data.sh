#!/bin/bash
# 清理BDD/E2E测试产生的垃圾数据，保留有效的基础数据
# 用于CI pipeline测试后清理

set -e

CONTAINER=ahvp-postgres
DB_USER=ahvp
DB_NAME=ahvp

echo '[cleanup] Cleaning up test data...'

docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "
  DELETE FROM evaluation_results;
  DELETE FROM chip_reports;
  DELETE FROM task_logs;
  DELETE FROM evaluation_tasks;
  DELETE FROM evaluation_plans;
  DELETE FROM chips WHERE name LIKE 'BDD-%' OR name LIKE 'Test%' OR name LIKE 'SearchTest%' OR name LIKE 'TypeTest%' OR name LIKE 'T152-%' OR name LIKE 'T153%' OR name LIKE 'E2E-%' OR name LIKE 'QuickDebug%' OR name LIKE 'Updated-%' OR name LIKE 'SpecChip-%' OR name LIKE 'VendorAlias-%' OR name LIKE 'TechSpec-%' OR name LIKE 'Regression%' OR name LIKE 'FieldTest-%' OR name LIKE 'Dim-Test-%' OR name LIKE 'test-%';
  DELETE FROM task_templates WHERE is_system = false AND (name LIKE 'BDD-%' OR name LIKE '编辑测试%' OR name LIKE '删除测试%' OR name LIKE 'test-%');
"

echo '[cleanup] Remaining data:'
docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "
  SELECT 'chips' as tbl, count(*) FROM chips
  UNION ALL SELECT 'plans', count(*) FROM evaluation_plans
  UNION ALL SELECT 'tasks', count(*) FROM evaluation_tasks
  UNION ALL SELECT 'templates', count(*) FROM task_templates;
"

echo '[cleanup] Done.'
