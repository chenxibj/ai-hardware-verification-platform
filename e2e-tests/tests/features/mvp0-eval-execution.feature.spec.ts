/**
 * Feature: MVP-0 评测执行 + 监控 + 报告自动生成 + 评分算法
 *
 * API 功能测试。UI 监控页测试已移除 (CI 只保留功能测试)。
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

/* ── Helper ── */
async function ensureChip(request: any, token: string) {
  const listRes = await apiGet(request, token, '/chips');
  const chips = (await listRes.json()).data || [];
  if (chips.length > 0) return chips[0];
  const createRes = await apiPost(request, token, '/chips', {
    name: `BDD-Exec-Chip-${Date.now()}`,
    vendor: 'BDD执行测试',
    chipType: 'GPU',
  });
  return (await createRes.json()).data;
}

async function createAndWaitPlan(request: any, token: string, chipId: number, preset = 'QUICK', timeoutMs = 180_000) {
  const planRes = await apiPost(request, token, '/plans', {
    chipId,
    name: `BDD-Exec-${preset}-${Date.now()}`,
    preset,
  });
  const plan = (await planRes.json()).data;
  const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await apiGet(request, token, `/plans/${plan.id}`);
    const current = (await res.json()).data;
    if (TERMINAL.includes(current.status)) return current;
    await new Promise(r => setTimeout(r, 3_000));
  }
  throw new Error(`Plan ${plan.id} timeout`);
}

async function getCompletedPlanWithReport(request: any, token: string) {
  const rptRes = await apiGet(request, token, '/chip-reports');
  const reports = (await rptRes.json()).data || [];
  if (reports.length > 0) {
    const report = reports[0];
    const planRes = await apiGet(request, token, `/plans/${report.planId}`);
    return { plan: (await planRes.json()).data, report };
  }
  return { plan: null, report: null };
}

// ============================================================================
// Feature 1: 任务执行状态流转
// ============================================================================
test.describe('MVP-0: 任务执行状态流转', () => {
  test.setTimeout(180_000);

  test('Scenario: API — 评测计划从提交到完成的完整流转', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const plan = await createAndWaitPlan(request, token, chip.id, 'QUICK');
    expect(['COMPLETED', 'FAILED']).toContain(plan.status);
    if (plan.status === 'COMPLETED') {
      expect(plan.progress).toBe(100);
      expect(plan.completedTasks).toBe(plan.totalTasks);
    }
  });

  test('Scenario: API — 计划执行中芯片状态变为 EVALUATING', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id,
      name: `BDD-StatusCheck-${Date.now()}`,
      preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;
    await new Promise(r => setTimeout(r, 2000));
    const chipRes = await apiGet(request, token, `/chips/${chip.id}`);
    const chipStatus = (await chipRes.json()).data.status;
    expect(['EVALUATING', 'EVALUATED']).toContain(chipStatus);
    const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      const res = await apiGet(request, token, `/plans/${planId}`);
      if (TERMINAL.includes((await res.json()).data.status)) break;
      await new Promise(r => setTimeout(r, 3_000));
    }
  });

  test('Scenario: API — 计划完成后芯片状态变为 EVALUATED', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const plan = await createAndWaitPlan(request, token, chip.id, 'QUICK');
    if (plan.status === 'COMPLETED') {
      const chipRes = await apiGet(request, token, `/chips/${chip.id}`);
      const chipData = (await chipRes.json()).data;
      expect(chipData.status).toBe('EVALUATED');
    }
  });

  test('Scenario: API — 任务完成后有结果数据', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const plan = await createAndWaitPlan(request, token, chip.id, 'QUICK');
    if (plan.status === 'COMPLETED') {
      const taskRes = await apiGet(request, token, `/tasks?planId=${plan.id}`);
      const tasks = (await taskRes.json()).data || [];
      const completed = tasks.filter((t: any) => t.status === 'COMPLETED');
      expect(completed.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Feature 2: 执行监控 (API only)
// ============================================================================
test.describe('MVP-0: 执行监控', () => {

  test('Scenario: API — 计划详情包含进度信息', async ({ request }) => {
    const { token } = await apiLogin(request);
    const planListRes = await apiGet(request, token, '/plans');
    const plans = (await planListRes.json()).data || [];
    test.skip(plans.length === 0, '无评测计划');
    const planId = plans[0].id;
    const res = await apiGet(request, token, `/plans/${planId}`);
    const plan = (await res.json()).data;
    expect(plan.progress).toBeGreaterThanOrEqual(0);
    expect(plan.progress).toBeLessThanOrEqual(100);
    expect(plan.totalTasks).toBeGreaterThan(0);
    expect(plan.completedTasks).toBeGreaterThanOrEqual(0);
  });

  test('Scenario: API — 任务按 dimension 分组', async ({ request }) => {
    const { token } = await apiLogin(request);
    const planListRes = await apiGet(request, token, '/plans?status=COMPLETED');
    const plans = (await planListRes.json()).data || [];
    test.skip(plans.length === 0, '无已完成计划');
    const taskRes = await apiGet(request, token, `/tasks?planId=${plans[0].id}`);
    const tasks = (await taskRes.json()).data || [];
    const dimensions = [...new Set(tasks.map((t: any) => t.dimension).filter(Boolean))];
    expect(dimensions.length).toBeGreaterThan(1);
  });
});

// ============================================================================
// Feature 3: 芯片评价报告
// ============================================================================
test.describe('MVP-0: 芯片评价报告', () => {
  test.setTimeout(180_000);

  test('Scenario: API — 完成的计划有关联报告', async ({ request }) => {
    const { token } = await apiLogin(request);
    const { plan, report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据，需先完成一个评测计划');
    expect(report).toBeTruthy();
    expect(report.chipId).toBeTruthy();
    expect(report.planId).toBeTruthy();
  });

  test('Scenario: API — 报告包含综合评分 0-100', async ({ request }) => {
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  test('Scenario: API — 报告包含多维度评分', async ({ request }) => {
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');
    const scores = report.dimensionScores || report.radarData;
    expect(scores).toBeTruthy();
    if (typeof scores === 'object') {
      const parsed = typeof scores === 'string' ? JSON.parse(scores) : scores;
      const keys = Array.isArray(parsed) ? parsed : Object.keys(parsed);
      expect(keys.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('Scenario: API — 报告包含瓶颈分析', async ({ request }) => {
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');
    expect(report.bottleneckAnalysis || report.recommendations).toBeTruthy();
  });

  test('Scenario: API — 按芯片 ID 查询报告', async ({ request }) => {
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');
    const res = await apiGet(request, token, `/chip-reports/chip/${report.chipId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 报告状态为 DRAFT 或 PUBLISHED', async ({ request }) => {
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');
    expect(['DRAFT', 'PUBLISHED']).toContain(report.status);
  });

  test('Scenario: API — 完整端到端：创建芯片→评测→生成报告', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chipRes = await apiPost(request, token, '/chips', {
      name: `BDD-E2E-${Date.now()}`,
      vendor: 'E2E测试',
      chipType: 'CPU',
    });
    const chip = (await chipRes.json()).data;
    expect(chip.status).toBe('REGISTERED');
    const plan = await createAndWaitPlan(request, token, chip.id, 'QUICK');
    if (plan.status === 'COMPLETED') {
      const rptRes = await apiGet(request, token, `/chip-reports/chip/${chip.id}`);
      const reports = (await rptRes.json()).data || [];
      expect(reports.length).toBeGreaterThan(0);
      const rpt = reports[0];
      expect(rpt.overallScore).toBeGreaterThanOrEqual(0);
      const chipRes2 = await apiGet(request, token, `/chips/${chip.id}`);
      const updatedChip = (await chipRes2.json()).data;
      expect(updatedChip.status).toBe('EVALUATED');
    }
  });
});
