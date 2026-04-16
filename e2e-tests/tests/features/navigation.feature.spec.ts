/**
 * Feature: 页面导航
 *
 * 验证侧边栏菜单能正确切换各个页面。
 * Updated: sidebar now uses submenu groups (评测中心, 数字资产, 资源管理, 社区, 系统设置)
 */
import { test, expect } from '../../fixtures/auth.fixture';

test.describe('Feature: 页面导航', () => {
  test('Scenario: 登录后默认显示Dashboard', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForTimeout(1000);

    // Then Dashboard 菜单项应被选中
    const dashboardItem = page.locator('.ant-menu-item').filter({ hasText: 'Dashboard' });
    await expect(dashboardItem).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: 侧边栏包含所有主要模块', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForTimeout(1000);

    // Then 应有 Dashboard 顶级菜单
    await expect(page.locator('.ant-menu-item').filter({ hasText: 'Dashboard' })).toBeVisible();

    // And 应有评测中心子菜单组
    await expect(page.locator('.ant-menu-submenu-title').filter({ hasText: '评测中心' })).toBeVisible();

    // And 应有数字资产子菜单组
    await expect(page.locator('.ant-menu-submenu-title').filter({ hasText: '数字资产' })).toBeVisible();

    // And 应有资源管理子菜单组
    await expect(page.locator('.ant-menu-submenu-title').filter({ hasText: '资源管理' })).toBeVisible();

    // And 应有系统设置子菜单组
    await expect(page.locator('.ant-menu-submenu-title').filter({ hasText: '系统设置' })).toBeVisible();
  });

  test('Scenario: 展开评测中心子菜单', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 点击评测中心
    await page.locator('.ant-menu-submenu-title').filter({ hasText: '评测中心' }).first().click();
    await page.waitForTimeout(500);

    // Then 应显示子菜单项
    const subItems = page.locator('.ant-menu-item');
    const texts = await subItems.allTextContents();
    const evalItems = texts.filter(
      (t) =>
        t.includes('芯片') ||
        t.includes('评测') ||
        t.includes('报告') ||
        t.includes('任务'),
    );
    expect(evalItems.length).toBeGreaterThan(0);
  });

  test('Scenario: 导航到评测报告页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 展开评测中心
    await page.locator('.ant-menu-submenu-title').filter({ hasText: '评测中心' }).first().click();
    await page.waitForTimeout(500);

    // And 点击评测报告
    const reportMenu = page.locator('.ant-menu-item').filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1000);
    }

    // Then 页面应加载报告内容
    const table = page.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: 侧边栏收起/展开', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录，侧边栏默认展开
    await expect(page.locator('.ant-layout-sider')).toBeVisible();

    // When 点击折叠按钮
    const trigger = page.locator('.ant-layout-sider-trigger');
    if (await trigger.count() > 0) {
      await trigger.click();

      // Then 侧边栏应收起
      await expect(page.locator('.ant-layout-sider-collapsed')).toBeVisible({ timeout: 5_000 });

      // When 再次点击
      await trigger.click();

      // Then 侧边栏应展开
      await expect(page.locator('.ant-layout-sider-collapsed')).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
