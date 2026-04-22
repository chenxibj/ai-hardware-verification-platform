// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost';
const LOGIN_EMAIL = 'admin@ahvp.com';
const LOGIN_PASSWORD = process.env.TEST_PASSWORD || 'Admin123456';

// All routes to test
const ROUTES = [
  ['/', 'Dashboard'],
  ['/chips', 'Chip List'],
  ['/chips/1', 'Chip Detail'],
  ['/chips/compare', 'Chip Compare'],
  ['/plans', 'Plan List'],
  ['/plans/create', 'Plan Create'],
  ['/plans/1', 'Plan Detail'],
  ['/templates', 'Templates'],
  ['/reports', 'Report List'],
  ['/reports/1', 'Report Detail'],
  ['/tasks/1', 'Task Detail'],
  ['/nodes', 'Node List'],
  ['/nodes/1', 'Node Detail'],
  ['/resource-pools', 'Resource Pools'],
  ['/resource-monitor', 'Resource Monitor'],
  ['/alerts', 'Alerts'],
  ['/assets', 'Assets'],
  ['/leaderboard', 'Leaderboard'],
  ['/community', 'Community'],
  ['/admin/users', 'Admin Users'],
  ['/admin/tenants', 'Admin Tenants'],
  ['/admin/audit', 'Admin Audit'],
  ['/settings', 'Settings'],
];

// Helper: login — the app renders Login component conditionally (not via /login route)
// After successful login, the app re-renders with MainLayout containing .ant-layout
async function login(page) {
  await page.goto(BASE + '/');
  
  // Wait for login form (Ant Design Input renders with ant-input class)
  await page.waitForSelector('.ant-input', { timeout: 15000 });
  
  // Fill email - Ant Design Form.Item with name="email"
  const emailInput = page.locator('#email, input[id="email"], input[placeholder="邮箱"]').first();
  if (await emailInput.count() === 0) {
    // fallback: first .ant-input
    await page.locator('.ant-input').first().fill(LOGIN_EMAIL);
  } else {
    await emailInput.fill(LOGIN_EMAIL);
  }
  
  // Fill password
  const pwInput = page.locator('input[type="password"]').first();
  await pwInput.fill(LOGIN_PASSWORD);
  
  // Click login button
  await page.locator('button[type="submit"]').first().click();
  
  // Wait for MainLayout to appear (login success = app renders layout)
  await page.waitForSelector('.ant-layout', { timeout: 20000 });
}

test.describe('Route Accessibility Tests', () => {
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  for (const [path, desc] of ROUTES) {
    test(`${desc} (${path}) should render without white screen`, async () => {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Page should not be a white screen
      const hasTestId = await page.locator('[data-testid]').count() > 0;
      const hasAntLayout = await page.locator('.ant-layout').count() > 0;
      const hasContent = await page.locator('.ant-layout-content, main, [class*="page"], [class*="container"]').count() > 0;
      
      expect(hasTestId || hasAntLayout || hasContent,
        `Page ${path} appears to be a white screen`
      ).toBeTruthy();
    });
  }

  test('/nonexistent should show 404 page', async () => {
    await page.goto(BASE + '/nonexistent', { waitUntil: 'networkidle', timeout: 30000 });
    
    const has404Text = await page.locator('text=404').count() > 0;
    const hasNotFound = await page.locator('text=/not found|页面不存在|未找到/i').count() > 0;
    const hasAntResult = await page.locator('.ant-result, .ant-result-404').count() > 0;
    
    expect(has404Text || hasNotFound || hasAntResult,
      'Expected /nonexistent to show a 404 page'
    ).toBeTruthy();
  });
});

test.describe('Navigation Interaction Tests', () => {
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('sidebar menu navigation changes URL and page', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    
    // Find a sidebar link to /chips
    const chipsLink = page.locator('a[href="/chips"]').first();
    if (await chipsLink.count() > 0) {
      await chipsLink.click();
      await page.waitForURL('**/chips', { timeout: 10000 });
      expect(page.url()).toContain('/chips');
      // Verify the page rendered content
      await page.waitForSelector('.ant-layout', { timeout: 5000 });
    } else {
      // Fallback: click any menu link
      const anyMenuLink = page.locator('.ant-menu-item a[href]').first();
      if (await anyMenuLink.count() > 0) {
        const href = await anyMenuLink.getAttribute('href');
        await anyMenuLink.click();
        await page.waitForTimeout(3000);
        expect(page.url()).toContain(href);
      }
    }
  });

  test('browser back/forward navigation works correctly', async () => {
    // Navigate to dashboard
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    
    // Navigate to chips
    await page.goto(BASE + '/chips', { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/chips');
    
    // Navigate to plans
    await page.goto(BASE + '/plans', { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/plans');
    
    // Go back to chips
    await page.goBack({ waitUntil: 'networkidle' });
    expect(page.url()).toContain('/chips');
    
    // Go forward to plans
    await page.goForward({ waitUntil: 'networkidle' });
    expect(page.url()).toContain('/plans');
  });

  test('F5 refresh preserves current route', async () => {
    // Navigate directly to /chips
    await page.goto(BASE + '/chips', { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/chips');
    
    // Verify page has layout
    const hasLayout = await page.locator('.ant-layout').count() > 0;
    expect(hasLayout).toBeTruthy();
    
    // Refresh
    await page.reload({ waitUntil: 'networkidle' });
    
    // URL should still contain /chips
    expect(page.url()).toContain('/chips');
    
    // Page should still have layout
    const hasLayoutAfterRefresh = await page.locator('.ant-layout').count() > 0;
    expect(hasLayoutAfterRefresh).toBeTruthy();
  });
});
