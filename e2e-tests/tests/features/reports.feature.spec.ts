/**
 * Feature: 评测报告
 * 验证报告查询、详情。
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('Feature: 评测报告', () => {
  test('Scenario: 查询报告列表', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询报告列表
    const res = await apiGet(request, token, '/reports');

    // Then 应返回成功
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    // data 是对象，包含 records 数组
    expect(body.data).toBeTruthy();
    expect(Array.isArray(body.data.records)).toBe(true);
  });

  test('Scenario: 查看报告详情包含完整数据', async ({ request }) => {
    // Given 用户已登录且存在报告
    const { token } = await apiLogin(request);
    const listRes = await apiGet(request, token, '/reports');
    const body = await listRes.json();
    const reports = body.data?.records || [];

    test.skip(reports.length === 0, '没有已生成的报告，跳过详情验证');

    // When 查询单个报告详情
    const reportId = reports[0].id;
    const detailRes = await apiGet(request, token, `/reports/${reportId}`);

    // Then 应返回完整信息
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()).data;
    expect(detail.reportNo).toBeTruthy();
    expect(detail.createdAt).toBeTruthy();
    expect(detail.overallScore).toBeDefined();
    expect(detail.dimensionScores).toBeTruthy();
  });

  test('Scenario: 报告列表包含必要字段', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/reports');
    const body = await res.json();
    const reports = body.data?.records || [];
    test.skip(reports.length === 0, '无报告数据');

    const report = reports[0];
    // 每份报告应包含核心字段
    expect(report).toHaveProperty('id');
    expect(report).toHaveProperty('reportNo');
    expect(report).toHaveProperty('chipId');
    expect(report).toHaveProperty('overallScore');
    expect(report).toHaveProperty('status');
  });

  test('Scenario: UI 查看报告列表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 展开评测中心子菜单，点击评测报告
    const evalMenu = page.locator('.ant-menu-submenu-title').filter({ hasText: '评测中心' });
    if (await evalMenu.count() > 0) {
      await evalMenu.first().click();
      await page.waitForTimeout(500);
    }
    const reportMenu = page.locator('.ant-menu-item').filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1000);
    }

    // Then 应显示报告管理标题或表格
    const table = page.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10_000 });
  });
});
