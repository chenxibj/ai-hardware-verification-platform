import { Page, expect } from '@playwright/test';

/**
 * Page Object for the Login page.
 */
export class LoginPage {
  constructor(private page: Page) {}

  /** Navigate to the app root (which shows login if unauthenticated) */
  async goto() {
    await this.page.goto('/');
    await expect(this.page.locator('text=欢迎登录')).toBeVisible({ timeout: 15_000 });
  }

  /** The email input */
  get emailInput() {
    return this.page.getByPlaceholder('邮箱');
  }

  /** The password input */
  get passwordInput() {
    return this.page.getByPlaceholder('密码');
  }

  /** Login button */
  get loginButton() {
    return this.page.getByRole('button', { name: '登 录' });
  }

  /** Switch to the register tab */
  async switchToRegister() {
    await this.page.getByRole('tab', { name: '注册' }).click();
  }

  /** Switch to the login tab */
  async switchToLogin() {
    await this.page.getByRole('tab', { name: '登录' }).click();
  }

  /** Fill & submit login form */
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /** Fill & submit register form */
  async register(username: string, email: string, password: string) {
    await this.switchToRegister();
    await this.page.getByPlaceholder('用户名').fill(username);
    // Register form also has email & password
    await this.page.getByPlaceholder('邮箱').fill(email);
    await this.page.getByPlaceholder('密码').fill(password);
    await this.page.getByRole('button', { name: '注 册' }).click();
  }

  /** Assert the "login success" toast appeared */
  async expectLoginSuccess() {
    await expect(this.page.locator('.ant-message-success')).toBeVisible({ timeout: 10_000 });
  }

  /** Assert the sidebar menu is visible (means login succeeded and we're in the app) */
  async expectInApp() {
    await expect(this.page.locator('.ant-menu')).toBeVisible({ timeout: 15_000 });
  }

  /** Assert an error toast is visible */
  async expectError() {
    await expect(this.page.locator('.ant-message-error')).toBeVisible({ timeout: 10_000 });
  }
}
