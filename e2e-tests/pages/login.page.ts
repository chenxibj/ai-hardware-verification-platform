import { type Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  private get emailInput() {
    return this.page.locator('input[placeholder*="邮箱"]');
  }
  private get passwordInput() {
    return this.page.locator('input[type="password"]');
  }
  private get loginButton() {
    return this.page.getByRole('button', { name: /登\s*录/ });
  }
  private get loginTab() {
    return this.page.getByRole('tab', { name: '登录' });
  }
  private get platformTitle() {
    return this.page.getByText('人工智能软硬件验证平台');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async isLoginPage(): Promise<boolean> {
    try {
      await this.platformTitle.first().waitFor({ timeout: 5000 });
      return (await this.loginButton.count()) > 0;
    } catch {
      return false;
    }
  }

  async login(email: string, password: string) {
    const tab = this.loginTab;
    if (await tab.isVisible()) await tab.click();

    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();

    // Wait for token in localStorage => login succeeded
    await this.page.waitForFunction(() => localStorage.getItem('token') !== null, {
      timeout: 10000,
    });
    await this.page.waitForTimeout(1000);
  }

  async loginAndVerify(email: string, password: string) {
    await this.goto();
    if (!(await this.isLoginPage())) return; // already logged in
    await this.login(email, password);
    await expect(this.page.locator('.ant-layout-sider')).toBeVisible({ timeout: 10000 });
  }
}
