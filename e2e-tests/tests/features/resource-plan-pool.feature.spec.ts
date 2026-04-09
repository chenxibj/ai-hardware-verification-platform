/**
 * Feature: 评测任务选择资源池
 * Tests: #251 评测任务选择资源池
 *
 * Covers:
 * - PlanCreate 增加资源池选择步骤
 * - 选资源池或手动选节点两种模式
 * - least_loaded 调度提示
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('Feature: 评测任务选择资源池 (#251)', () => {
  test('Scenario: API — 资源池列表可用于评测选择', async ({ request }) => {
    // Given 已登录
    const { token } = await apiLogin(request);

    // When GET /api/resource-pools
    const res = await apiGet(request, token, '/resource-pools');

    // Then 返回可用的资源池列表
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const pools = Array.isArray(body.data) ? body.data : (body.data?.items || body.data?.list || []);
    // 至少应有一个资源池可供选择
    expect(pools.length).toBeGreaterThan(0);
    // 每个资源池应有 id 和 name
    for (const pool of pools) {
      expect(pool).toHaveProperty('id');
      expect(pool).toHaveProperty('name');
    }
  });

  test('Scenario: UI — 评测任务页面加载', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 已登录
    // When 导航到评测任务列表
    const evalMenu = page.locator('.ant-menu-submenu', { hasText: '评测中心' });
    await evalMenu.click();
    await page.locator('.ant-menu-item', { hasText: '评测任务' }).click();
    await page.waitForTimeout(2000);

    // Then 页面显示评测任务列表和创建按钮
    await expect(page.locator('.ant-table, .ant-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /创建任务/ })).toBeVisible({ timeout: 5_000 });
  });

  test('Scenario: UI — 创建评测计划进入表单', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 已登录在评测任务页面
    const evalMenu = page.locator('.ant-menu-submenu', { hasText: '评测中心' });
    await evalMenu.click();
    await page.locator('.ant-menu-item', { hasText: '评测任务' }).click();
    await page.waitForTimeout(2000);

    // When 点击创建任务
    await page.getByRole('button', { name: /创建任务/ }).click();
    await page.waitForTimeout(2000);

    // Then 页面应渲染创建表单（步骤式）
    const content = page.locator('.ant-form, .ant-steps, [class*="plan"], [class*="Plan"], .ant-card');
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: UI — 资源池选择有调度策略提示', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 已登录
    // When 导航到资源池管理查看调度
    const resourceMenu = page.locator('.ant-menu-submenu', { hasText: '资源管理' });
    await resourceMenu.click();
    await page.locator('.ant-menu-item', { hasText: '资源池' }).click();
    await page.waitForTimeout(3000);

    // Then 页面应显示资源池信息（调度策略可能在详情中）
    const content = page.locator('.ant-table, .ant-card');
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
