import { type Page, expect } from '@playwright/test';

/**
 * Page Object for navigating between pages via the sidebar menu.
 * The app uses state-based navigation (currentPage), not URL routes.
 */
export class AppNavigation {
  constructor(private page: Page) {}

  private menuItem(text: string) {
    return this.page.locator('.ant-menu-item').filter({ hasText: text });
  }

  async navigateTo(pageName: string) {
    await this.menuItem(pageName).click();
    await this.page.waitForTimeout(800);
  }

  async navigateToDashboard() {
    await this.navigateTo('工作台');
  }
  async navigateToTasks() {
    await this.navigateTo('评测任务');
  }
  async navigateToWorkflows() {
    await this.navigateTo('评测编排');
  }
  async navigateToReports() {
    await this.navigateTo('评测报告');
  }
  async navigateToComparisons() {
    await this.navigateTo('报告对比');
  }
  async navigateToLogs() {
    await this.navigateTo('评测日志');
  }
  async navigateToAssets() {
    await this.navigateTo('数字资产');
  }
  async navigateToResources() {
    await this.navigateTo('计算资源');
  }
  async navigateToCommunity() {
    await this.navigateTo('社区');
  }
  async navigateToUsers() {
    await this.navigateTo('用户管理');
  }
  async navigateToAudit() {
    await this.navigateTo('操作审计');
  }
  async navigateToSettings() {
    await this.navigateTo('系统设置');
  }

  /** Verify sidebar is visible (= user is logged in) */
  async expectSidebarVisible() {
    await expect(this.page.locator('.ant-layout-sider')).toBeVisible({ timeout: 5000 });
  }
}

/** Page Object for Resources page */
export class ResourcesPage {
  constructor(private page: Page) {}

  async navigateTo() {
    await new AppNavigation(this.page).navigateToResources();
  }

  async isLoaded(): Promise<boolean> {
    try {
      // Resources page should have a table or cards
      await this.page
        .locator('.ant-table, .ant-card')
        .first()
        .waitFor({ timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
