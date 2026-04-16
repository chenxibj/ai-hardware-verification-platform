/**
 * Feature: 评测报告对比分析
 *
 * API 功能测试。UI 对比页测试已移除 (CI 只保留功能测试)。
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('Feature: 评测报告对比分析 API', () => {
  let token: string;
  let reportIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
    const res = await apiGet(request, token, '/chip-reports?page=0&size=5');
    const body = await res.json();
    if (body.code === 0 && body.data) {
      reportIds = body.data
        .filter((r: any) => r.status === 'PUBLISHED')
        .map((r: any) => r.id);
    }
  });

  test('Scenario: API — chip-reports 列表接口可用', async ({ request }) => {
    const res = await apiGet(request, token, '/chip-reports?page=0&size=10');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('Scenario: API — chip-reports/compare 对比接口返回正确结构', async ({ request }) => {
    test.skip(reportIds.length < 2, '已发布报告不足2份，跳过');
    const ids = reportIds.slice(0, 2).join(',');
    const res = await apiGet(request, token, `/chip-reports/compare?ids=${ids}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toBeTruthy();
    expect(body.data.reports).toBeTruthy();
    expect(body.data.reports.length).toBe(2);
    const report = body.data.reports[0];
    expect(report.dimensions).toBeTruthy();
    expect(report.overallScore).toBeDefined();
  });
});
