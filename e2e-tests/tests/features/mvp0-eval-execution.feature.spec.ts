/**
 * Feature: MVP-0 评测执行 + 监控 + 报告自动生成 + 评分算法
 *
 * 覆盖产品设计文档 MVP-0 P0 功能:
 *   - 任务调度执行 (PENDING→RUNNING→COMPLETED/FAILED)
 *   - 执行监控 (进度跟踪、任务分组)
 *   - 结果自动收集 (EvaluationResult)
 *   - 芯片评价报告自动生成
 *   - 评分算法 (综合评分 0-100, 六维度)
 *   - 能力画像自动更新
 *   - 芯片状态流转 (REGISTERED→EVALUATING→EVALUATED)
 *
 * 关联 Issue: [MVP-0][BDD] 评测执行 + 监控 + 报告生成 + 评分
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
  // 优先找已有的
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
    // Given 用户已登录并创建了芯片
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 创建 QUICK 评测计划并等待完成
    const plan = await createAndWaitPlan(request, token, chip.id, 'QUICK');

    // Then 计划到达终态
    expect(['COMPLETED', 'FAILED']).toContain(plan.status);

    // And 进度为 100%（如果 COMPLETED）
    if (plan.status === 'COMPLETED') {
      expect(plan.progress).toBe(100);
      expect(plan.completedTasks).toBe(plan.totalTasks);
    }
  });

  test('Scenario: API — 计划执行中芯片状态变为 EVALUATING', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 创建并提交评测计划
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id,
      name: `BDD-StatusCheck-${Date.now()}`,
      preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;

    // Then 等待一小段时间后，芯片状态应变为 EVALUATING（或已 EVALUATED）
    await new Promise(r => setTimeout(r, 2000));
    const chipRes = await apiGet(request, token, `/chips/${chip.id}`);
    const chipStatus = (await chipRes.json()).data.status;
    expect(['EVALUATING', 'EVALUATED']).toContain(chipStatus);

    // Cleanup: 等计划完成
    const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      const res = await apiGet(request, token, `/plans/${planId}`);
      if (TERMINAL.includes((await res.json()).data.status)) break;
      await new Promise(r => setTimeout(r, 3_000));
    }
  });

  test('Scenario: API — 计划完成后芯片状态变为 EVALUATED', async ({ request }) => {
    // Given 用户已登录并有完成的评测计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 计划执行完毕
    const plan = await createAndWaitPlan(request, token, chip.id, 'QUICK');

    if (plan.status === 'COMPLETED') {
      // Then 芯片状态应为 EVALUATED
      const chipRes = await apiGet(request, token, `/chips/${chip.id}`);
      const chipData = (await chipRes.json()).data;
      expect(chipData.status).toBe('EVALUATED');
    }
  });

  test('Scenario: API — 任务完成后有结果数据', async ({ request }) => {
    // Given 用户已登录并有完成的计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const plan = await createAndWaitPlan(request, token, chip.id, 'QUICK');

    if (plan.status === 'COMPLETED') {
      // When 查询该计划的任务
      const taskRes = await apiGet(request, token, `/tasks?planId=${plan.id}`);
      const tasks = (await taskRes.json()).data || [];

      // Then 至少有一个任务完成并有结果
      const completed = tasks.filter((t: any) => t.status === 'COMPLETED');
      expect(completed.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Feature 2: 执行监控
// ============================================================================
test.describe('MVP-0: 执行监控', () => {

  test('Scenario: API — 计划详情包含进度信息', async ({ request }) => {
    // Given 用户已登录且有评测计划
    const { token } = await apiLogin(request);
    const planListRes = await apiGet(request, token, '/plans');
    const plans = (await planListRes.json()).data || [];
    test.skip(plans.length === 0, '无评测计划');

    // When 查询计划详情
    const planId = plans[0].id;
    const res = await apiGet(request, token, `/plans/${planId}`);
    const plan = (await res.json()).data;

    // Then 应有进度信息
    expect(plan.progress).toBeGreaterThanOrEqual(0);
    expect(plan.progress).toBeLessThanOrEqual(100);
    expect(plan.totalTasks).toBeGreaterThan(0);
    expect(plan.completedTasks).toBeGreaterThanOrEqual(0);
  });

  test('Scenario: API — 任务按 dimension 分组', async ({ request }) => {
    // Given 用户已登录且有完成的计划
    const { token } = await apiLogin(request);
    const planListRes = await apiGet(request, token, '/plans?status=COMPLETED');
    const plans = (await planListRes.json()).data || [];
    test.skip(plans.length === 0, '无已完成计划');

    // When 查询该计划的任务
    const taskRes = await apiGet(request, token, `/tasks?planId=${plans[0].id}`);
    const tasks = (await taskRes.json()).data || [];

    // Then 任务应有不同的 dimension 分类
    const dimensions = [...new Set(tasks.map((t: any) => t.dimension).filter(Boolean))];
    expect(dimensions.length).toBeGreaterThan(1);
  });

  test('Scenario: UI — 执行监控页面显示进度', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录并导航到评测计划
    await page.locator('.ant-menu').getByText('评测计划').click();
    await page.waitForTimeout(500);

    // When 点击某个计划查看详情
    const planRow = page.locator('.ant-table-row').first();
    if (await planRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const viewBtn = planRow.locator('button, a').first();
      await viewBtn.click();
      await page.waitForTimeout(1000);

      // Then 应看到进度信息
      const hasProgress = await page.locator('.ant-progress, [class*="progress"]').first()
        .isVisible({ timeout: 5_000 }).catch(() => false);
      const hasTaskList = await page.getByText(/任务|完成|运行/).first()
        .isVisible({ timeout: 5_000 }).catch(() => false);
      expect(hasProgress || hasTaskList).toBeTruthy();
    }
  });
});

// ============================================================================
// Feature 3: 芯片评价报告自动生成
// ============================================================================
test.describe('MVP-0: 芯片评价报告', () => {
  test.setTimeout(180_000);

  test('Scenario: API — 完成的计划有关联报告', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);
    const { plan, report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据，需先完成一个评测计划');

    // Then 报告存在
    expect(report).toBeTruthy();
    expect(report.chipId).toBeTruthy();
    expect(report.planId).toBeTruthy();
  });

  test('Scenario: API — 报告包含综合评分 0-100', async ({ request }) => {
    // Given 用户已登录且有报告
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');

    // Then 综合评分在 0-100 范围
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  test('Scenario: API — 报告包含六维度评分', async ({ request }) => {
    // Given 用户已登录且有报告
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');

    // Then 有 dimensionScores 或 radarData
    const scores = report.dimensionScores || report.radarData;
    expect(scores).toBeTruthy();

    // And 如果是对象/数组，应有多个维度
    if (typeof scores === 'object') {
      const parsed = typeof scores === 'string' ? JSON.parse(scores) : scores;
      const keys = Array.isArray(parsed) ? parsed : Object.keys(parsed);
      expect(keys.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('Scenario: API — 报告包含瓶颈分析', async ({ request }) => {
    // Given 用户已登录且有报告
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');

    // Then 有瓶颈分析数据
    expect(report.bottleneckAnalysis || report.recommendations).toBeTruthy();
  });

  test('Scenario: API — 按芯片 ID 查询报告', async ({ request }) => {
    // Given 用户已登录且有报告
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');

    // When 按芯片 ID 查报告
    const res = await apiGet(request, token, `/chip-reports/chip/${report.chipId}`);

    // Then 返回该芯片的报告列表
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 报告状态为 DRAFT 或 PUBLISHED', async ({ request }) => {
    // Given 用户已登录且有报告
    const { token } = await apiLogin(request);
    const { report } = await getCompletedPlanWithReport(request, token);
    test.skip(!report, '无报告数据');

    // Then 状态是合法枚举值
    expect(['DRAFT', 'PUBLISHED']).toContain(report.status);
  });

  test('Scenario: API — 完整端到端：创建芯片→评测→生成报告', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // Step 1: 注册新芯片
    const chipRes = await apiPost(request, token, '/chips', {
      name: `BDD-E2E-${Date.now()}`,
      vendor: 'E2E测试',
      chipType: 'CPU',
    });
    const chip = (await chipRes.json()).data;
    expect(chip.status).toBe('REGISTERED');

    // Step 2: 创建 QUICK 评测计划并等待完成
    const plan = await createAndWaitPlan(request, token, chip.id, 'QUICK');

    if (plan.status === 'COMPLETED') {
      // Step 3: 验证报告已生成
      const rptRes = await apiGet(request, token, `/chip-reports/chip/${chip.id}`);
      const reports = (await rptRes.json()).data || [];
      expect(reports.length).toBeGreaterThan(0);

      // And 报告有评分
      const rpt = reports[0];
      expect(rpt.overallScore).toBeGreaterThanOrEqual(0);

      // Step 4: 芯片状态更新
      const chipRes2 = await apiGet(request, token, `/chips/${chip.id}`);
      const updatedChip = (await chipRes2.json()).data;
      expect(updatedChip.status).toBe('EVALUATED');
    }
  });
});
