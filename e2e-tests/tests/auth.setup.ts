import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Click the login tab if visible
  const loginTab = page.getByRole('tab', { name: '登录' });
  if (await loginTab.isVisible()) await loginTab.click();

  // Fill credentials
  await page.locator('input[placeholder*="邮箱"]').fill('test@ahvp.com');
  await page.locator('input[type="password"]').fill('test123');
  await page.getByRole('button', { name: /登\s*录/ }).click();

  // Wait for login to complete — token in localStorage
  await page.waitForFunction(() => localStorage.getItem('token') !== null, {
    timeout: 15000,
  });

  // Wait for the main layout to appear
  await expect(page.locator('.ant-layout-sider')).toBeVisible({ timeout: 10000 });

  // Save storage state
  await page.context().storageState({ path: authFile });
});
