/**
 * Feature: 数字资产管理
 * 验证资产列表查询、类型筛选、UI 展示。
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('Feature: 数字资产管理', () => {
  test('Scenario: 查询数字资产列表', async ({ request }) => {
    // Given 用户已通过 API 登录
    const { token } = await apiLogin(request);

    // When 查询资产列表
    const res = await apiGet(request, token, '/assets');

    // Then 应返回成功
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);

    // And 如果有资产，每个应有名称和类型
    if (body.data.length > 0) {
      const asset = body.data[0];
      expect(asset.name).toBeTruthy();
      expect(asset.assetType).toBeTruthy();
    }
  });

  test('Scenario: 按类型筛选数据集资产', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 按 DATASET 类型筛选
    const res = await apiGet(request, token, '/assets?assetType=DATASET');

    // Then 应返回成功
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // And 返回的资产应都是 DATASET 类型
    for (const asset of body.data || []) {
      expect(asset.assetType).toBe('DATASET');
    }
  });

  test('Scenario: UI 查看数字资产页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 展开数字资产子菜单
    const assetMenu = page.locator('.ant-menu-submenu-title').filter({ hasText: '数字资产' });
    if (await assetMenu.count() > 0) {
      await assetMenu.first().click();
      await page.waitForTimeout(500);
    }
    // 点击子菜单项（可能叫"资产管理"或直接显示列表）
    const subItem = page.locator('.ant-menu-item').filter({ hasText: /资产/ });
    if (await subItem.count() > 0) {
      await subItem.first().click();
      await page.waitForTimeout(1000);
    }

    // Then 页面应正常加载（显示表格或空状态）
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 10_000 }).catch(() => false);
    const hasEmpty = await page.locator('.ant-empty, [class*=empty]').isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });
});
