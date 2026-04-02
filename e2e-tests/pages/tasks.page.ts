import { Page, expect } from '@playwright/test';

/**
 * Page Object for the Tasks page (评测任务管理).
 */
export class TasksPage {
  constructor(private page: Page) {}

  /** Navigate to the tasks page via sidebar menu */
  async goto() {
    await this.page.locator('.ant-menu-item', { hasText: '评测任务' }).click();
    await expect(this.page.locator('text=评测任务管理')).toBeVisible({ timeout: 10_000 });
  }

  /** Click the "创建任务" button */
  async clickCreateTask() {
    await this.page.getByRole('button', { name: /创建任务/ }).click();
  }

  /** Select template-based creation mode */
  async selectTemplateMode() {
    await this.page.locator('h3', { hasText: '模板化创建' }).click();
  }

  /** Select custom creation mode */
  async selectCustomMode() {
    await this.page.locator('h3', { hasText: '自定义创建' }).click();
  }

  /** Select a preset template by name */
  async selectPresetTemplate(name: string) {
    await this.page.locator('h4', { hasText: name }).click();
  }

  /** Click "下一步" (Next) */
  async clickNext() {
    await this.page.getByRole('button', { name: '下一步' }).click();
  }

  /** Click "提交创建" or "提交" (Submit) */
  async clickSubmit() {
    // Try both possible button labels
    const submitBtn = this.page.getByRole('button', { name: /提交/ });
    await submitBtn.click();
  }

  /** Fill task name in the form */
  async fillTaskName(name: string) {
    await this.page.locator('input#name').fill(name);
  }

  /** Wait for the task table to show the task row */
  async expectTaskInTable(taskName: string) {
    await expect(this.page.locator('.ant-table-tbody').locator(`text=${taskName}`)).toBeVisible({
      timeout: 15_000,
    });
  }

  /** Click detail button on first matching task row */
  async clickDetailOnTask(taskName: string) {
    const row = this.page.locator('.ant-table-row', { hasText: taskName }).first();
    await row.getByRole('button', { name: '详情' }).click();
  }

  /** Reload task list */
  async refresh() {
    await this.page.getByRole('button', { name: /刷新/ }).click();
    await this.page.waitForTimeout(1000);
  }
}
