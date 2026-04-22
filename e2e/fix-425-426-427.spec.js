// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost';
const LOGIN_EMAIL = 'admin@ahvp.com';
const LOGIN_PASSWORD = process.env.TEST_PASSWORD || 'Admin123456';

async function login(page) {
  await page.goto(BASE + '/');
  await page.waitForSelector('.ant-input', { timeout: 15000 });
  const emailInput = page.locator('#email, input[id="email"], input[placeholder="邮箱"]').first();
  if (await emailInput.count() === 0) {
    await page.locator('.ant-input').first().fill(LOGIN_EMAIL);
  } else {
    await emailInput.fill(LOGIN_EMAIL);
  }
  await page.locator('input[type="password"]').first().fill(LOGIN_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForSelector('.ant-layout', { timeout: 20000 });
}

test.describe('#425 Plan detail navigation', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => { await page.close(); });

  test('clicking eye icon on plan list navigates to /plans/:id', async () => {
    await page.goto(BASE + '/plans', { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for the table to render rows
    await page.waitForSelector('.ant-table-row', { timeout: 15000 });

    // Click the first eye button (执行监控)
    const eyeBtn = page.locator('.ant-table-row').first().locator('button').filter({ has: page.locator('[aria-label="eye"]') }).first();
    // Fallback: find button with EyeOutlined icon
    const eyeBtnAlt = page.locator('.ant-table-row').first().locator('button .anticon-eye').first();

    if (await eyeBtn.count() > 0) {
      await eyeBtn.click();
    } else {
      await eyeBtnAlt.click();
    }

    // Should navigate to /plans/<some-id> (not stay on /plans)
    await page.waitForURL('**/plans/*', { timeout: 10000 });
    const url = page.url();
    expect(url).toMatch(/\/plans\/\d+/);

    // Should render PlanMonitor page content
    const hasContent = await page.locator('text=返回任务列表').count() > 0
      || await page.locator('text=任务列表').count() > 0
      || await page.locator('[data-testid="page-plan-monitor"]').count() > 0;
    expect(hasContent).toBeTruthy();
  });
});

test.describe('#426 Notification count API 404', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => { await page.close(); });

  test('no console error for notifications/count 404', async () => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('notifications/count')) {
        consoleErrors.push(msg.text());
      }
    });

    // Also catch network request failures
    const failedRequests = [];
    page.on('requestfailed', (req) => {
      if (req.url().includes('notifications/count')) {
        failedRequests.push(req.url());
      }
    });

    // Track response status
    const notif404s = [];
    page.on('response', (res) => {
      if (res.url().includes('notifications/count') && res.status() === 404) {
        notif404s.push(res.url());
      }
    });

    await login(page);
    await page.waitForTimeout(3000);

    // The frontend should NOT make a request to /notifications/count that returns 404
    // OR it should gracefully handle it without console errors
    expect(notif404s.length, 'notifications/count should not return 404').toBe(0);
  });
});

test.describe('#427 Chip link in plan list', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => { await page.close(); });

  test('chip name link should go to /chips/:chipId not /chips', async () => {
    await page.goto(BASE + '/plans', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.ant-table-row', { timeout: 15000 });

    // Find the chip link in the first row
    const chipLink = page.locator('.ant-table-row').first().locator('a[href]').first();
    const href = await chipLink.getAttribute('href');

    // The href should be /chips/<id> not just /chips
    expect(href, 'Chip link should include chip ID').toMatch(/\/chips\/\d+/);
  });
});
