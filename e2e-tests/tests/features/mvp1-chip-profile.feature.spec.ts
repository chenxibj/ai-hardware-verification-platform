/**
 * Feature: MVP-1 芯片档案 & 报告 (Issues #138 #139 #140 #141 #142)
 *
 * API 功能测试。UI Tab 切换/雷达图渲染/按钮可见性测试已移除 (CI 只保留功能测试)。
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

/* ── 常量 ── */
const SIX_DIMENSIONS = ['计算性能', '访存性能', '数学函数', 'Attention能力', '归一化性能', '模型推理'];
const DIM_KEYS = ['compute_perf', 'memory_perf', 'math_func', 'attention', 'normalization', 'model_inference'];

/* ── Helper：确保至少有一个已评测芯片 + 报告 ── */
async function getChipWithReport(request: any) {
  const { token } = await apiLogin(request);
  const rptRes = await apiGet(request, token, '/chip-reports');
  const rptBody = await rptRes.json();
  const reports = rptBody.data || [];
  if (reports.length > 0) {
    const report = reports[0];
    const chipRes = await apiGet(request, token, `/chips/${report.chipId}`);
    const chipBody = await chipRes.json();
    return { token, chip: chipBody.data, report };
  }
  const chipRes = await apiGet(request, token, '/chips');
  const chipBody = await chipRes.json();
  const chips = chipBody.data || [];
  const chip = chips.find((c: any) => c.status === 'EVALUATED') || chips[0];
  return { token, chip: chip || null, report: null };
}

// ============================================================================
// #138 — 芯片档案页 API
// ============================================================================
test.describe('Issue #138: 芯片档案 API 验证', () => {

  test('Scenario: API — 芯片详情接口返回完整数据', async ({ request }) => {
    const { token, chip } = await getChipWithReport(request);
    test.skip(!chip, '无芯片数据，跳过');
    const res = await apiGet(request, token, `/chips/${chip!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const data = body.data;
    expect(data.id).toBeTruthy();
    expect(data.name).toBeTruthy();
    expect(data.chipNo).toBeTruthy();
    expect(data.chipType).toBeTruthy();
  });

  test('Scenario: API — 按芯片 ID 查询报告列表', async ({ request }) => {
    const { token, chip, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    const res = await apiGet(request, token, `/chip-reports/chip/${chip!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// #139 — 能力画像雷达图 API
// ============================================================================
test.describe('Issue #139: 能力画像雷达图 API 验证', () => {

  test('Scenario: API — 报告包含六维雷达图数据', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    const radarData = typeof report!.radarData === 'string'
      ? JSON.parse(report!.radarData)
      : report!.radarData;
    expect(Array.isArray(radarData)).toBe(true);
    expect(radarData.length).toBe(6);
    for (const item of radarData) {
      expect(item.dimension).toBeTruthy();
      expect(typeof item.score).toBe('number');
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
    }
    const dims = radarData.map((r: any) => r.dimension);
    for (const expected of SIX_DIMENSIONS) {
      expect(dims).toContain(expected);
    }
  });

  test('Scenario: API — 报告包含各维度评分数值', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    const dimScores = typeof report!.dimensionScores === 'string'
      ? JSON.parse(report!.dimensionScores)
      : report!.dimensionScores;
    expect(dimScores).toBeTruthy();
    for (const key of DIM_KEYS) {
      expect(dimScores).toHaveProperty(key);
      expect(typeof dimScores[key]).toBe('number');
    }
  });

  test('Scenario: API — 报告综合评分在合理范围', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    expect(report!.overallScore).toBeGreaterThanOrEqual(0);
    expect(report!.overallScore).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// #141 — 完整芯片评价报告 API
// ============================================================================
test.describe('Issue #141: 完整芯片评价报告 API 验证', () => {

  test('Scenario: API — 报告详情包含完整 5 板块数据', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    const res = await apiGet(request, token, `/chip-reports/${report!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const detail = body.data;

    const radarData = typeof detail.radarData === 'string' ? JSON.parse(detail.radarData) : detail.radarData;
    expect(radarData.length).toBe(6);
    expect(detail.overallScore).toBeGreaterThan(0);

    const dimScores = typeof detail.dimensionScores === 'string' ? JSON.parse(detail.dimensionScores) : detail.dimensionScores;
    expect(Object.keys(dimScores).length).toBeGreaterThanOrEqual(6);

    const operators = typeof detail.operatorRanking === 'string' ? JSON.parse(detail.operatorRanking) : detail.operatorRanking;
    expect(Array.isArray(operators)).toBe(true);
    expect(operators.length).toBeGreaterThan(0);

    const bottleneck = typeof detail.bottleneckAnalysis === 'string' ? JSON.parse(detail.bottleneckAnalysis) : detail.bottleneckAnalysis;
    expect(Array.isArray(bottleneck)).toBe(true);
    expect(bottleneck.length).toBeGreaterThan(0);

    const scenarios = typeof detail.scenarioRecommendations === 'string' ? JSON.parse(detail.scenarioRecommendations) : detail.scenarioRecommendations;
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 瓶颈分析包含最慢算子', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    const bottleneck = typeof report!.bottleneckAnalysis === 'string'
      ? JSON.parse(report!.bottleneckAnalysis)
      : report!.bottleneckAnalysis;
    const types = bottleneck.map((b: any) => b.type);
    expect(types.some((t: string) => t === 'worst_operator' || t === 'weak_dimension')).toBeTruthy();
    for (const item of bottleneck) {
      expect(item.level).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.detail).toBeTruthy();
    }
  });

  test('Scenario: API — 场景推荐包含三级分类', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    const scenarios = typeof report!.scenarioRecommendations === 'string'
      ? JSON.parse(report!.scenarioRecommendations)
      : report!.scenarioRecommendations;
    const types = scenarios.map((s: any) => s.type);
    const validTypes = ['recommended', 'caution', 'unverified'];
    for (const t of types) {
      expect(validTypes).toContain(t);
    }
    for (const item of scenarios) {
      expect(item.scenario).toBeTruthy();
      expect(item.reason).toBeTruthy();
    }
  });

  test('Scenario: API — 算子排行包含评分和延迟', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    const operators = typeof report!.operatorRanking === 'string'
      ? JSON.parse(report!.operatorRanking)
      : report!.operatorRanking;
    expect(operators.length).toBeGreaterThan(0);
    const firstOp = operators[0];
    expect(firstOp.testItem).toBeTruthy();
    expect(typeof firstOp.score).toBe('number');
    expect(typeof firstOp.passed).toBe('boolean');
  });

  test('Scenario: API — chip-reports 接口返回有效数据供 PDF 渲染', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');
    const res = await apiGet(request, token, `/chip-reports/${report!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const detail = body.data;
    expect(detail.overallScore).toBeDefined();
    expect(detail.radarData).toBeTruthy();
    expect(detail.dimensionScores).toBeTruthy();
    expect(detail.operatorRanking).toBeTruthy();
  });
});
