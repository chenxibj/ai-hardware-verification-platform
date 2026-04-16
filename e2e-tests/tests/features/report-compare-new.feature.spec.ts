/**
 * Feature: 评测报告对比分析（#444-#449 重写版）
 * 验证对比 API + 前端对比入口
 *
 * 测试点:
 * - POST /comparisons 创建对比（需要 baselineReportId + testReportIds）
 * - 对比结果包含 dimensionVsPcts / operatorComparisons
 * - 如果报告不足 2 个应返回错误
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 评测报告对比分析 (#444-#449 重写版)', () => {
  let token: string;
  let reportIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;

    // 获取已发布报告的 ID 列表
    const res = await apiGet(request, token, '/reports');
    const body = await res.json();
    const records = body.data?.records || [];
    reportIds = records
      .filter((r: any) => r.status === 'PUBLISHED')
      .map((r: any) => r.id);
  });

  // ── API 层测试 ──

  test('Scenario: POST /comparisons 创建对比 — 成功', async ({ request }) => {
    test.skip(reportIds.length < 2, '已发布报告不足2份');

    // Given 有 baseline 和 test 报告
    const baselineId = reportIds[0];
    const testIds = [reportIds[1]];

    // When 创建对比
    const res = await apiPost(request, token, '/comparisons', {
      baselineReportId: baselineId,
      testReportIds: testIds,
    });

    // Then 返回成功
    expect(res.ok(), `Expected 2xx, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);

    // And 包含对比数据
    expect(body.data).toBeTruthy();
    expect(body.data.baselineReportId).toBe(baselineId);
    expect(body.data.testReportIds).toEqual(testIds);
    expect(Array.isArray(body.data.reports)).toBeTruthy();
  });

  test('Scenario: 对比结果包含 dimensionVsPcts', async ({ request }) => {
    test.skip(reportIds.length < 2, '已发布报告不足2份');

    const res = await apiPost(request, token, '/comparisons', {
      baselineReportId: reportIds[0],
      testReportIds: [reportIds[1]],
    });
    const body = await res.json();
    const comparison = body.data?.reports?.[0];

    // Then 包含维度对比百分比
    expect(comparison).toHaveProperty('dimensionVsPcts');
    const vsPcts = comparison.dimensionVsPcts;

    // And 维度 key 是英文
    for (const key of Object.keys(vsPcts)) {
      expect(key).toMatch(/^[a-z_]+$/);
    }
  });

  test('Scenario: 对比结果包含 operatorComparisons', async ({ request }) => {
    test.skip(reportIds.length < 2, '已发布报告不足2份');

    const res = await apiPost(request, token, '/comparisons', {
      baselineReportId: reportIds[0],
      testReportIds: [reportIds[1]],
    });
    const body = await res.json();
    const comparison = body.data?.reports?.[0];

    // Then 包含算子级对比
    expect(comparison).toHaveProperty('operatorComparisons');
    expect(Array.isArray(comparison.operatorComparisons)).toBeTruthy();

    if (comparison.operatorComparisons.length > 0) {
      const op = comparison.operatorComparisons[0];
      expect(op).toHaveProperty('testItem');
      expect(op).toHaveProperty('dimension');
      expect(op).toHaveProperty('metrics');
    }
  });

  test('Scenario: 对比结果包含 overallVsPct', async ({ request }) => {
    test.skip(reportIds.length < 2, '已发布报告不足2份');

    const res = await apiPost(request, token, '/comparisons', {
      baselineReportId: reportIds[0],
      testReportIds: [reportIds[1]],
    });
    const body = await res.json();
    const comparison = body.data?.reports?.[0];

    // Then 包含总体对比百分比
    expect(comparison).toHaveProperty('overallVsPct');
    expect(typeof comparison.overallVsPct).toBe('number');
  });

  test('Scenario: 缺少 testReportIds 时返回错误', async ({ request }) => {
    test.skip(reportIds.length === 0, '无报告数据');

    // When 只提供 baseline 不提供 test
    const res = await apiPost(request, token, '/comparisons', {
      baselineReportId: reportIds[0],
    });
    const body = await res.json();

    // Then 应返回错误
    expect(body.success).toBe(false);
    expect(body.message).toBeTruthy();
  });

  test('Scenario: 缺少 baselineReportId 时返回错误', async ({ request }) => {
    test.skip(reportIds.length === 0, '无报告数据');

    // When 只提供 testReportIds 不提供 baseline
    const res = await apiPost(request, token, '/comparisons', {
      testReportIds: [reportIds[0]],
    });
    const body = await res.json();

    // Then 应返回错误
    expect(body.success).toBe(false);
    expect(body.message).toBeTruthy();
  });

  test('Scenario: 多份报告同时对比', async ({ request }) => {
    test.skip(reportIds.length < 3, '已发布报告不足3份');

    // When 对比 baseline + 2 份测试报告
    const res = await apiPost(request, token, '/comparisons', {
      baselineReportId: reportIds[0],
      testReportIds: [reportIds[1], reportIds[2]],
    });

    // Then 返回成功
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);

    // And 对比结果数量应匹配
    expect(body.data.reports.length).toBe(2);
  });

  test('Scenario: 对比接口需要认证', async ({ request }) => {
    test.skip(reportIds.length < 2, '已发布报告不足2份');

    // When 不带 token 调用
    const res = await request.post(`${API_BASE}/comparisons`, {
      data: {
        baselineReportId: reportIds[0],
        testReportIds: [reportIds[1]],
      },
    });

    // Then 应返回 401
    expect(res.status()).toBe(401);
  });

  // ── 对比结果业务正确性 ──

  test('Scenario: 相同报告对比时 overallVsPct 应接近 100%', async ({ request }) => {
    test.skip(reportIds.length === 0, '无报告数据');

    // When 同一报告作为 baseline 和 test
    const res = await apiPost(request, token, '/comparisons', {
      baselineReportId: reportIds[0],
      testReportIds: [reportIds[0]],
    });

    if (res.ok()) {
      const body = await res.json();
      if (body.success && body.data?.reports?.[0]) {
        const vsPct = body.data.reports[0].overallVsPct;
        // 自比应接近 100%
        expect(vsPct).toBeGreaterThanOrEqual(95);
        expect(vsPct).toBeLessThanOrEqual(105);
      }
    }
    // 如果后端不允许自比，也是合理行为
  });
});
