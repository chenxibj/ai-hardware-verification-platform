/**
 * Feature: 页面导航
 *
 * 验证侧边栏菜单能正确切换各个页面。
 */
import { test, expect } from '../../fixtures/auth.fixture';

const MENU_PAGES: Array<{ menu: string; header: string }> = [
  { menu: '工作台', header: '工作台' },
  { menu: '评测任务', header: '评测任务管理' },
  { menu: '评测模板', header: '评测模板管理' },
  { menu: '评测编排', header: '评测编排工作流' },
  { menu: '评测报告', header: '评测报告管理' },
  { menu: '报告对比', header: '报告对比分析' },
  { menu: '评测日志', header: '评测日志' },
  { menu: '数字资产', header: '数字资产管理' },
  { menu: '计算资源', header: '计算资源管理' },
  { menu: '社区', header: '验证平台社区' },
  { menu: '用户管理', header: '用户管理' },
  { menu: '操作审计', header: '操作审计' },
  { menu: '系统设置', header: '系统设置' },
];

test.describe('Feature: 页面导航', () => {
  test('Scenario: 登录后默认显示工作台', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已成功登录
    // Then 页面标题应为"工作台"
    await expect(page.locator('header strong', { hasText: '工作台' })).toBeVisible();
  });

  for (const { menu, header } of MENU_PAGES) {
    test(`Scenario: 导航到"${menu}"页面`, async ({ authenticatedPage }) => {
      const page = authenticatedPage;

      // Given 用户已登录
      // When 点击侧边栏的"${menu}"菜单
      await page.locator('.ant-menu-item', { hasText: menu }).click();

      // Then 页面标题应显示"${header}"
      await expect(page.locator('header strong', { hasText: header })).toBeVisible({
        timeout: 10_000,
      });
    });
  }

  test('Scenario: 侧边栏收起/展开', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录，侧边栏默认展开
    await expect(page.locator('.ant-layout-sider')).toBeVisible();

    // When 点击折叠按钮
    await page.locator('.ant-layout-sider-trigger').click();

    // Then 侧边栏应收起（宽度变小）
    await expect(page.locator('.ant-layout-sider-collapsed')).toBeVisible({ timeout: 5_000 });

    // When 再次点击
    await page.locator('.ant-layout-sider-trigger').click();

    // Then 侧边栏应展开
    await expect(page.locator('.ant-layout-sider-collapsed')).not.toBeVisible({ timeout: 5_000 });
  });
});
