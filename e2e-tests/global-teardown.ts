/**
 * Playwright Global Teardown
 * Cleans up all test data after E2E tests to keep the database clean.
 */
import { execSync } from 'child_process';

const CLEANUP_SQL = `
DELETE FROM evaluation_results;
DELETE FROM chip_reports;
DELETE FROM task_logs;
DELETE FROM evaluation_tasks;
DELETE FROM evaluation_plans;
DELETE FROM chips WHERE name LIKE 'BDD-%' OR name LIKE 'Test%' OR name LIKE 'SearchTest%' OR name LIKE 'TypeTest%' OR name LIKE 'T152-%' OR name LIKE 'T153%' OR name LIKE 'E2E-%' OR name LIKE 'QuickDebug%' OR name LIKE 'Updated-%' OR name LIKE 'SpecChip-%' OR name LIKE 'VendorAlias-%' OR name LIKE 'TechSpec-%' OR name LIKE 'Regression%' OR name LIKE 'FieldTest-%' OR name LIKE 'Dim-Test-%' OR name LIKE 'test-%' OR name LIKE 'Persist-%' OR name LIKE 'Edited-%';
DELETE FROM task_templates WHERE is_system = false;
DELETE FROM compute_nodes WHERE name LIKE 'BDD-%' OR name LIKE 'test-%';
`.trim().replace(/\n/g, ' ');

export default async function globalTeardown() {
  console.log('[global-teardown] Cleaning up test data...');
  try {
    execSync(`docker exec ahvp-postgres psql -U ahvp -d ahvp -c "${CLEANUP_SQL}"`, {
      stdio: 'pipe',
      timeout: 10000,
    });
    console.log('[global-teardown] Test data cleaned successfully.');
  } catch (err: any) {
    console.warn('[global-teardown] Cleanup failed (non-fatal):', err.message);
  }
}
