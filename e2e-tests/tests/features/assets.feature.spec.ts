/**
 * Feature: 数字资产管理
 * 验证资产列表查询、类型筛选。
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 数字资产管理', () => {
  test('Scenario: 查询数字资产列表', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/assets');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      const asset = body.data[0];
      expect(asset.name).toBeTruthy();
      expect(asset.assetType).toBeTruthy();
    }
  });

  test('Scenario: 按类型筛选数据集资产', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/assets?assetType=DATASET');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // Then 返回的资产应都是 DATASET 类型
    for (const asset of body.data || []) {
      expect(asset.assetType).toBe('DATASET');
    }
  });

  test('Scenario: UI 查看数字资产页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.locator('.ant-menu-item', { hasText: '数字资产' }).click();
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });

    // Then 表头应包含关键列
    const headerText = await page.locator('.ant-table-thead').textContent();
    expect(headerText).toMatch(/名称|资产/);
    expect(headerText).toMatch(/类型/);
  });
});
