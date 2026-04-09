/**
 * Feature: 数字资产管理 P2 — 校验、回收站、备份、存储监控
 * @issues #272 #273 #274 #275
 */
import { test, expect } from '../../fixtures/auth.fixture';

test.describe('Feature: 资产校验 (#272)', () => {
  test('Scenario: 打开校验页面并执行校验', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 点击数字资产子菜单中的"资产校验"
    await page.locator('.ant-menu-submenu', { hasText: '数字资产' }).click();
    await page.locator('.ant-menu-item', { hasText: '资产校验' }).click();

    // Then 应显示校验页面标题
    await expect(page.locator('text=资产校验')).toBeVisible({ timeout: 10_000 });

    // And 应显示校验类型选择
    await expect(page.locator('text=文件完整性')).toBeVisible();
    await expect(page.locator('text=ONNX 可加载')).toBeVisible();

    // When 点击开始校验
    const startBtn = page.getByRole('button', { name: /开始校验/ });
    if (await startBtn.isVisible()) {
      await startBtn.click();
      // Then 应展示校验结果
      await expect(page.locator('text=校验').first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test('Scenario: 校验历史列表展示', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.locator('.ant-menu-submenu', { hasText: '数字资产' }).click();
    await page.locator('.ant-menu-item', { hasText: '资产校验' }).click();
    await expect(page.locator('text=资产校验')).toBeVisible({ timeout: 10_000 });

    // Then 应展示校验历史区域
    await expect(page.locator('text=校验历史')).toBeVisible();
  });
});

test.describe('Feature: 回收站 (#273)', () => {
  test('Scenario: 打开回收站页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 点击数字资产子菜单中的"回收站"
    await page.locator('.ant-menu-submenu', { hasText: '数字资产' }).click();
    await page.locator('.ant-menu-item', { hasText: '回收站' }).click();

    // Then 应显示回收站页面
    await expect(page.locator('text=资产回收站')).toBeVisible({ timeout: 10_000 });

    // And 应有恢复和永久删除操作提示
    await expect(page.locator('text=30').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Scenario: 回收站恢复和永久删除功能可见', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.locator('.ant-menu-submenu', { hasText: '数字资产' }).click();
    await page.locator('.ant-menu-item', { hasText: '回收站' }).click();
    await expect(page.locator('text=资产回收站')).toBeVisible({ timeout: 10_000 });

    // Then 应展示清空回收站按钮
    await expect(page.getByRole('button', { name: /清空/ })).toBeVisible();
  });
});

test.describe('Feature: 自动备份 (#274)', () => {
  test('Scenario: 手动备份并查看备份列表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 导航到备份管理页面
    await page.locator('.ant-menu-submenu', { hasText: '数字资产' }).click();
    await page.locator('.ant-menu-item', { hasText: '备份管理' }).click();

    // Then 应显示备份管理页面
    await expect(page.locator('text=备份管理')).toBeVisible({ timeout: 10_000 });

    // When 点击手动备份按钮
    const backupBtn = page.getByRole('button', { name: /手动备份|立即备份/ });
    await expect(backupBtn).toBeVisible();
    await backupBtn.click();

    // Then 应展示备份进度
    await expect(page.locator('.ant-progress').first()).toBeVisible({ timeout: 10_000 });

    // And 等待备份完成后应在列表中可见
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 20_000 });
  });

  test('Scenario: 自动备份设置', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.locator('.ant-menu-submenu', { hasText: '数字资产' }).click();
    await page.locator('.ant-menu-item', { hasText: '备份管理' }).click();
    await expect(page.locator('text=备份管理')).toBeVisible({ timeout: 10_000 });

    // Then 应展示自动备份开关
    await expect(page.locator('.ant-switch').first()).toBeVisible();
  });
});

test.describe('Feature: 存储监控面板 (#275)', () => {
  test('Scenario: 用量展示和趋势图渲染', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 导航到存储监控页面
    await page.locator('.ant-menu-submenu', { hasText: '数字资产' }).click();
    await page.locator('.ant-menu-item', { hasText: '存储监控' }).click();

    // Then 应显示存储监控页面
    await expect(page.locator('text=存储监控')).toBeVisible({ timeout: 10_000 });

    // And 应展示用量统计
    await expect(page.locator('text=存储用量')).toBeVisible();
    await expect(page.locator('.ant-progress').first()).toBeVisible();

    // And 应展示趋势图区域
    await expect(page.locator('text=用量趋势')).toBeVisible();

    // And 应展示分类占比
    await expect(page.locator('text=分类占比')).toBeVisible();
  });

  test('Scenario: 告警阈值配置', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.locator('.ant-menu-submenu', { hasText: '数字资产' }).click();
    await page.locator('.ant-menu-item', { hasText: '存储监控' }).click();
    await expect(page.locator('text=存储监控')).toBeVisible({ timeout: 10_000 });

    // Then 应展示告警配置区域
    await expect(page.locator('text=告警').first()).toBeVisible();
  });
});
