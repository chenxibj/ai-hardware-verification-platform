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

    // Then 应返回成功且有数据
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // And 每个资产应有名称和类型
    const asset = body.data[0];
    expect(asset.name).toBeTruthy();
    expect(asset.assetType).toBeTruthy();
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

    // Given 用户已登录
    // When 导航到数字资产页面
    await page.locator('.ant-menu-item', { hasText: '数字资产' }).click();

    // Then 应显示资产表格
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });

    // And 表头应包含关键列
    const headerText = await page.locator('.ant-table-thead').textContent();
    expect(headerText).toMatch(/名称|资产/);
    expect(headerText).toMatch(/类型/);
  });
});
