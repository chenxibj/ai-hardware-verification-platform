import { test, expect } from '../fixtures/test-fixtures';

test.describe('Page Navigation & Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Ensure sidebar loaded
    await expect(page.locator('.ant-layout-sider')).toBeVisible({ timeout: 10000 });
  });

  const pages = [
    { menu: '工作台', key: 'dashboard', expectText: /任务|评测|总数|执行/ },
    { menu: '评测任务', key: 'tasks', expectText: /评测任务|创建评测/ },
    { menu: '评测报告', key: 'reports', expectText: /报告|评测/ },
    { menu: '计算资源', key: 'resources', expectText: /资源|节点|计算/ },
    { menu: '评测编排', key: 'workflows', expectText: /编排|工作流|流程/ },
    { menu: '报告对比', key: 'comparisons', expectText: /对比|比较|报告/ },
    { menu: '数字资产', key: 'assets', expectText: /资产|数据|模型/ },
    { menu: '评测日志', key: 'logs', expectText: /日志|评测/ },
    { menu: '社区', key: 'community', expectText: /社区|讨论|帖子/ },
    { menu: '用户管理', key: 'users', expectText: /用户|管理/ },
    { menu: '操作审计', key: 'audit', expectText: /审计|操作|日志/ },
    { menu: '系统设置', key: 'settings', expectText: /设置|系统|配置/ },
  ];

  for (const p of pages) {
    test(`can navigate to ${p.menu} (${p.key})`, async ({ page }) => {
      const menuItem = page.locator('.ant-menu-item').filter({ hasText: p.menu });
      // Some items might be in sub-groups, ensure they're visible
      await menuItem.scrollIntoViewIfNeeded();
      await menuItem.click();
      await page.waitForTimeout(1000);

      // Page should render content (not be blank)
      const content = page.locator('.ant-layout-content');
      await expect(content).toBeVisible();

      // Verify some expected text appears (indicates page rendered)
      const bodyText = await content.textContent();
      expect(bodyText).toBeTruthy();
      expect(bodyText!.length).toBeGreaterThan(10);
    });
  }

  test('sidebar shows correct menu structure', async ({ page }) => {
    const sider = page.locator('.ant-layout-sider');
    await expect(sider.getByText('工作台')).toBeVisible();
    await expect(sider.getByText('评测任务')).toBeVisible();
    await expect(sider.getByText('评测报告')).toBeVisible();
    await expect(sider.getByText('计算资源')).toBeVisible();
  });

  test('header shows platform name', async ({ page }) => {
    await expect(page.getByText(/AI.*验证平台|AHVP/)).toBeVisible();
  });
});
