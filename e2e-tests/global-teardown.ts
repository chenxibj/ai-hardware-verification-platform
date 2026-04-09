/**
 * Playwright Global Teardown
 * Cleans up BDD/E2E test data after tests complete.
 * Only removes data with BDD-specific naming patterns, never touches real data.
 */
import { execSync } from 'child_process';

const CLEANUP_SQL = [
  "DELETE FROM evaluation_results WHERE plan_id IN (SELECT id FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%')",
  "DELETE FROM chip_reports WHERE plan_id IN (SELECT id FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%')",
  "DELETE FROM task_logs WHERE task_id IN (SELECT id FROM evaluation_tasks WHERE plan_id IN (SELECT id FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%'))",
  "DELETE FROM evaluation_tasks WHERE plan_id IN (SELECT id FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%')",
  "DELETE FROM evaluation_plans WHERE name LIKE 'BDD-%' OR name LIKE 'Persist-%' OR name LIKE 'Updated-%' OR name LIKE 'Edited-%'",
  "DELETE FROM chips WHERE name LIKE 'BDD-%' OR name LIKE 'SearchTest-%' OR name LIKE 'TypeTest-%' OR name LIKE 'T152-%' OR name LIKE 'T153%' OR name LIKE 'E2E-%' OR name LIKE 'QuickDebug-%' OR name LIKE 'SpecChip-%' OR name LIKE 'VendorAlias-%' OR name LIKE 'TechSpec-%' OR name LIKE 'FieldTest-%' OR name LIKE 'Dim-Test-%'",
  "DELETE FROM task_templates WHERE is_system = false AND name LIKE 'BDD%'",
  "UPDATE compute_nodes SET resource_pool_id = NULL WHERE name LIKE 'BDD-%'",
  "DELETE FROM compute_nodes WHERE name LIKE 'BDD-%'",
  "DELETE FROM resource_pools WHERE name LIKE 'BDD-%'",
].join('; ');

export default async function globalTeardown() {
  console.log('[global-teardown] Cleaning up BDD test data...');
  try {
    execSync(`docker exec ahvp-postgres psql -U ahvp -d ahvp -c "${CLEANUP_SQL}"`, {
      stdio: 'pipe',
      timeout: 10000,
    });
    console.log('[global-teardown] BDD test data cleaned successfully.');
  } catch (err: any) {
    console.warn('[global-teardown] Cleanup failed (non-fatal):', err.message);
  }
}
