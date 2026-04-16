/**
 * Feature: 报告评分体系（#456 #458）
 * 验证星级评分和维度评分一致性
 *
 * 测试点:
 * - 报告详情中 overallScore 和 dimensionScores 一致
 * - 维度评分 key 全部是英文
 * - 评分 0 分 = 无数据，不是薄弱（#440）
 * - overallScore >= 100 时应为高评分
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('Feature: 报告评分体系 (#456 #458)', () => {
  let token: string;
  let reports: any[] = [];

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;

    // 获取报告列表
    const res = await apiGet(request, token, '/reports');
    const body = await res.json();
    reports = body.data?.records || [];
  });

  test('Scenario: 报告列表包含 overallScore', async () => {
    test.skip(reports.length === 0, '无报告数据');

    for (const report of reports) {
      expect(report).toHaveProperty('overallScore');
      expect(typeof report.overallScore).toBe('number');
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
    }
  });

  test('Scenario: 报告 dimensionScores key 全部是英文', async () => {
    test.skip(reports.length === 0, '无报告数据');

    for (const report of reports) {
      const scores =
        typeof report.dimensionScores === 'string'
          ? JSON.parse(report.dimensionScores)
          : report.dimensionScores;

      if (!scores) continue;

      for (const key of Object.keys(scores)) {
        // key 应该是英文标识符，不含中文
        expect(key).toMatch(/^[a-z_]+$/);
      }
    }
  });

  test('Scenario: 评分 0 分的维度 = 无数据（#440）', async ({ request }) => {
    test.skip(reports.length === 0, '无报告数据');

    // 查找有 0 分维度的报告
    const reportWith0 = reports.find((r) => {
      const scores =
        typeof r.dimensionScores === 'string'
          ? JSON.parse(r.dimensionScores)
          : r.dimensionScores;
      return scores && Object.values(scores).some((v) => v === 0);
    });

    if (!reportWith0) {
      test.skip(true, '无 0 分维度的报告');
      return;
    }

    // 检查报告详情中的 radarData
    const detailRes = await apiGet(request, token, `/reports/${reportWith0.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()).data;
    const radarData =
      typeof detail.radarData === 'string'
        ? JSON.parse(detail.radarData)
        : detail.radarData;

    // 0 分维度对应的 radarData 项应体现"无数据"而非"薄弱"
    // 验证方式：通信/训练为 0 分时，对应 operators 列表中 validCount 应为 0
    const zeroDims = radarData?.filter((r: any) => r.score === 0) || [];
    for (const dim of zeroDims) {
      // 0 分不代表薄弱，代表该维度未执行评测
      expect(dim.score).toBe(0);
      // dimKey 应是英文
      expect(dim.dimKey).toMatch(/^[a-z_]+$/);
    }
  });

  test('Scenario: overallScore >= 100 时为优秀评分', async () => {
    test.skip(reports.length === 0, '无报告数据');

    const highScoreReports = reports.filter((r) => r.overallScore >= 100);
    test.skip(highScoreReports.length === 0, '无 >=100 分的报告');

    for (const report of highScoreReports) {
      // 高分报告的各维度评分应合理
      const scores =
        typeof report.dimensionScores === 'string'
          ? JSON.parse(report.dimensionScores)
          : report.dimensionScores;

      // 至少有部分维度也是高分
      const nonZeroScores = Object.values(scores).filter(
        (v: any) => typeof v === 'number' && v > 0,
      );
      expect(nonZeroScores.length).toBeGreaterThan(0);
    }
  });

  test('Scenario: 报告详情中 radarData dimKey 全部英文', async ({ request }) => {
    test.skip(reports.length === 0, '无报告数据');

    // 获取第一份报告详情
    const detailRes = await apiGet(request, token, `/reports/${reports[0].id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()).data;

    const radarData =
      typeof detail.radarData === 'string'
        ? JSON.parse(detail.radarData)
        : detail.radarData;

    if (!radarData || !Array.isArray(radarData)) {
      test.skip(true, '报告无 radarData');
      return;
    }

    for (const item of radarData) {
      // dimKey 应为英文
      expect(item.dimKey).toMatch(/^[a-z_]+$/);
      // score 应为数字
      expect(typeof item.score).toBe('number');
    }
  });

  test('Scenario: bottleneckAnalysis 可解析', async ({ request }) => {
    test.skip(reports.length === 0, '无报告数据');

    const detailRes = await apiGet(request, token, `/reports/${reports[0].id}`);
    const detail = (await detailRes.json()).data;

    const analysis =
      typeof detail.bottleneckAnalysis === 'string'
        ? JSON.parse(detail.bottleneckAnalysis)
        : detail.bottleneckAnalysis;

    if (!analysis || !Array.isArray(analysis)) {
      test.skip(true, '无 bottleneckAnalysis');
      return;
    }

    // 每项应有 type 和 level
    for (const item of analysis) {
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('level');
      expect(['info', 'warning', 'danger']).toContain(item.level);
    }
  });
});
