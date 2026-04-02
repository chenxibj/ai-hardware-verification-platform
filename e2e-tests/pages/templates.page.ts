import { Page, expect } from '@playwright/test';

/**
 * Page Object for the Templates page (评测模板管理).
 */
export class TemplatesPage {
  constructor(private page: Page) {}

  /** Navigate to the templates page via sidebar menu */
  async goto() {
    await this.page.locator('.ant-menu-item', { hasText: '评测模板' }).click();
    await expect(this.page.locator('text=评测模板管理')).toBeVisible({ timeout: 10_000 });
  }

  /** Click the "新建模板" button */
  async clickCreateTemplate() {
    await this.page.getByRole('button', { name: /新建模板/ }).click();
  }

  /** Fill template creation/edit form */
  async fillForm(opts: { name: string; description?: string; evalType?: string }) {
    await this.page.locator('#name').fill(opts.name);
    if (opts.description) {
      await this.page.locator('#description').fill(opts.description);
    }
    if (opts.evalType) {
      await this.page.locator('#evalType').click();
      await this.page.locator('.ant-select-item-option', { hasText: opts.evalType }).click();
    }
  }

  /** Submit modal form (OK button) */
  async submitForm() {
    await this.page.getByRole('button', { name: '确 定' }).click();
  }

  /** Expect success message */
  async expectSuccess(message?: string) {
    await expect(this.page.locator('.ant-message-success')).toBeVisible({ timeout: 10_000 });
  }

  /** Get template table */
  get table() {
    return this.page.locator('.ant-table');
  }
}
