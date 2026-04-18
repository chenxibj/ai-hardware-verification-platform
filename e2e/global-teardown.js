/**
 * #493: Playwright global teardown — clean up test data after all tests
 */
const { execSync } = require('child_process');

module.exports = async function globalTeardown() {
  console.log('[global-teardown] Cleaning up test data...');
  
  try {
    // Clean up test compute nodes created during e2e tests
    execSync(
      `docker exec ahvp-postgres psql -U ahvp -d ahvp_db -c "DELETE FROM gpu_slots WHERE node_id IN (SELECT id FROM compute_nodes WHERE name LIKE '%test%')"`,
      { stdio: 'pipe' }
    );
    execSync(
      `docker exec ahvp-postgres psql -U ahvp -d ahvp_db -c "DELETE FROM compute_nodes WHERE name LIKE '%test%'"`,
      { stdio: 'pipe' }
    );
    console.log('[global-teardown] Test compute nodes cleaned');
  } catch (e) {
    console.warn('[global-teardown] Cleanup warning:', e.message);
  }
};
