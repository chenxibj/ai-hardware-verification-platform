import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // no auth

  test('shows login form on first visit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('人工智能软硬件验证平台')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('AI Hardware Verification Platform')).toBeVisible();
    await expect(page.locator('input[placeholder*="邮箱"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /登\s*录/ })).toBeVisible();
  });

  test('shows both login and register tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: '登录' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '注册' })).toBeVisible();
  });

  test('login with valid credentials succeeds', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loginTab = page.getByRole('tab', { name: '登录' });
    if (await loginTab.isVisible()) await loginTab.click();

    await page.locator('input[placeholder*="邮箱"]').fill('test@ahvp.com');
    await page.locator('input[type="password"]').fill('test123');
    await page.getByRole('button', { name: /登\s*录/ }).click();

    // Should navigate to main app
    await expect(page.locator('.ant-layout-sider')).toBeVisible({ timeout: 15000 });

    // Token should be set
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });

  test('login with wrong password does not log in', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loginTab = page.getByRole('tab', { name: '登录' });
    if (await loginTab.isVisible()) await loginTab.click();

    await page.locator('input[placeholder*="邮箱"]').fill('test@ahvp.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: /登\s*录/ }).click();

    // Wait for the API response to process
    await page.waitForTimeout(3000);

    // The app's 401 interceptor may reload the page, but user should NOT be logged in
    // Either we see an error message OR we're back on the login form
    await page.waitForLoadState('networkidle');

    // Verify: no token stored = not logged in
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeFalsy();

    // Should still show login form (original or after reload)
    await expect(page.locator('input[placeholder*="邮箱"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /登\s*录/ })).toBeVisible();
  });

  test('shows test account hint', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('test@ahvp.com')).toBeVisible();
  });
});
