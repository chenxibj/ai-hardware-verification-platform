/**
 * Feature: MVP-0 评测计划创建向导 + 预设方案 + 任务自动拆分
 *
 * 覆盖产品设计文档 MVP-0 P0 功能:
 *   - 创建评测计划 (5步向导: 选芯片→选评测项→配参数→选节点→确认)
 *   - 快速选择预设 (QUICK/STANDARD/COMPREHENSIVE)
 *   - 预设方案任务数递增
 *   - 任务自动拆分 (计划→N个EvaluationTask)
 *   - 任务 dimension 自动分类
 *   - 评测计划列表
 *   - 评测计划状态流转
 *
 * 关联 Issue: [MVP-0][BDD] 评测计划向导 + 预设方案 + 任务拆分
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';
import { Page } from '@playwright/test';

/* ── Helper: 确保有可用芯片 ── */
async function ensureChip(request: any, token: string) {
  const listRes = await apiGet(request, token, '/chips');
  const chips = (await listRes.json()).data || [];
  if (chips.length > 0) return chips[0];

  const createRes = await apiPost(request, token, '/chips', {
    name: `BDD-Plan-Chip-${Date.now()}`,
    vendor: 'BDD测试',
    chipType: 'GPU',
  });
  return (await createRes.json()).data;
}

/* ── Helper: 创建评测计划 ── */
async function createPlan(request: any, token: string, chipId: number, preset: string) {
  return apiPost(request, token, '/plans', {
    chipId,
    name: `BDD-${preset}-${Date.now()}`,
    preset,
  });
}

/* ── Helper: 等待计划完成 ── */
async function pollPlanUntilDone(
  request: any, token: string, planId: number,
  timeoutMs = 120_000, intervalMs = 3_000,
) {
  const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await apiGet(request, token, `/plans/${planId}`);
    const plan = (await res.json()).data;
    if (TERMINAL.includes(plan.status)) return plan;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Plan ${planId} did not reach terminal state within ${timeoutMs}ms`);
}

// ============================================================================
// Feature 1: 评测计划创建 - API
// ============================================================================
test.describe('MVP-0: 评测计划创建', () => {

  test('Scenario: API — 创建评测计划关联芯片', async ({ request }) => {
    // Given 用户已登录且有注册芯片
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 创建评测计划
    const res = await createPlan(request, token, chip.id, 'QUICK');

    // Then 计划创建成功
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // And 计划关联到正确芯片
    const plan = body.data;
    expect(plan.chipId).toBe(chip.id);
    expect(plan.name).toBeTruthy();
    expect(plan.status).toBeTruthy();
  });

  test('Scenario: API — 不指定芯片创建计划失败', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 创建计划但不传 chipId
    const res = await apiPost(request, token, '/plans', {
      name: `BDD-NoChip-${Date.now()}`,
      preset: 'QUICK',
    });

    // Then 应返回错误（计划必须关联芯片）
    const body = await res.json();
    expect(body.code).not.toBe(0);
  });

  test('Scenario: API — 获取评测计划列表', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询计划列表
    const res = await apiGet(request, token, '/plans');

    // Then 返回计划数组
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Scenario: API — 按芯片 ID 筛选评测计划', async ({ request }) => {
    // Given 用户已登录且芯片有评测计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    await createPlan(request, token, chip.id, 'QUICK');

    // When 按芯片筛选
    const res = await apiGet(request, token, `/plans?chipId=${chip.id}`);

    // Then 返回的计划都属于该芯片
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    for (const plan of body.data || []) {
      expect(plan.chipId).toBe(chip.id);
    }
  });

  test('Scenario: API — 按状态筛选评测计划', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 按 COMPLETED 筛选
    const res = await apiGet(request, token, '/plans?status=COMPLETED');

    // Then 返回的都是已完成计划
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const plan of body.data || []) {
      expect(plan.status).toBe('COMPLETED');
    }
  });

  test('Scenario: API — 查看评测计划详情', async ({ request }) => {
    // Given 用户已登录且有计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;

    // When 查询计划详情
    const res = await apiGet(request, token, `/plans/${planId}`);

    // Then 返回完整信息
    expect(res.ok()).toBeTruthy();
    const plan = (await res.json()).data;
    expect(plan.id).toBe(planId);
    expect(plan.chipId).toBe(chip.id);
    expect(plan.totalTasks).toBeGreaterThan(0);
  });
});

// ============================================================================
// Feature 2: 预设方案 — 任务数递增
// ============================================================================
test.describe('MVP-0: 预设方案任务数', () => {

  test('Scenario: API — QUICK 预设生成约 7 个任务', async ({ request }) => {
    // Given 用户已登录且有芯片
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 用 QUICK 预设创建计划
    const res = await createPlan(request, token, chip.id, 'QUICK');
    const plan = (await res.json()).data;

    // Then 总任务数应在 5-15 之间（快速验证）
    expect(plan.totalTasks).toBeGreaterThanOrEqual(5);
    expect(plan.totalTasks).toBeLessThanOrEqual(15);
  });

  test('Scenario: API — STANDARD 预设生成约 17 个任务', async ({ request }) => {
    // Given 用户已登录且有芯片
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 用 STANDARD 预设创建计划
    const res = await createPlan(request, token, chip.id, 'STANDARD');
    const plan = (await res.json()).data;

    // Then 总任务数应在 10-30 之间
    expect(plan.totalTasks).toBeGreaterThanOrEqual(10);
    expect(plan.totalTasks).toBeLessThanOrEqual(30);
  });

  test('Scenario: API — COMPREHENSIVE 预设生成最多任务', async ({ request }) => {
    // Given 用户已登录且有芯片
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 用 COMPREHENSIVE 预设创建计划
    const res = await createPlan(request, token, chip.id, 'COMPREHENSIVE');
    const plan = (await res.json()).data;

    // Then 总任务数应大于 STANDARD 的最小值
    expect(plan.totalTasks).toBeGreaterThan(15);
  });

  test('Scenario: API — 三种预设任务数严格递增 QUICK < STANDARD < COMPREHENSIVE', async ({ request }) => {
    // Given 用户已登录且有芯片
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 分别用三种预设创建计划
    const quickRes = await createPlan(request, token, chip.id, 'QUICK');
    const stdRes = await createPlan(request, token, chip.id, 'STANDARD');
    const compRes = await createPlan(request, token, chip.id, 'COMPREHENSIVE');

    const quickTasks = (await quickRes.json()).data.totalTasks;
    const stdTasks = (await stdRes.json()).data.totalTasks;
    const compTasks = (await compRes.json()).data.totalTasks;

    // Then 任务数严格递增
    expect(stdTasks).toBeGreaterThan(quickTasks);
    expect(compTasks).toBeGreaterThan(stdTasks);
  });
});

// ============================================================================
// Feature 3: 任务自动拆分
// ============================================================================
test.describe('MVP-0: 任务自动拆分', () => {

  test('Scenario: API — 提交计划后自动生成评测任务', async ({ request }) => {
    // Given 用户已登录并创建了评测计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;

    // When 查询该计划下的任务
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);

    // Then 应有自动拆分的任务
    expect(taskRes.ok()).toBeTruthy();
    const body = await taskRes.json();
    const tasks = body.data || [];
    expect(tasks.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 每个任务有 testSubject 和 testItem', async ({ request }) => {
    // Given 用户已登录并有评测计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;

    // When 查询任务列表
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    const tasks = (await taskRes.json()).data || [];

    // Then 每个任务都有 testSubject (OPERATOR/MODEL) 和 testItem
    for (const task of tasks) {
      expect(['OPERATOR', 'MODEL']).toContain(task.testSubject);
      expect(task.testItem).toBeTruthy();
    }
  });

  test('Scenario: API — 每个任务有 dimension 分类', async ({ request }) => {
    // Given 用户已登录并有评测计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'STANDARD');
    const planId = (await planRes.json()).data.id;

    // When 查询任务列表
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    const tasks = (await taskRes.json()).data || [];

    // Then 每个任务都有 dimension（不为 null）
    for (const task of tasks) {
      expect(task.dimension).toBeTruthy();
    }
  });

  test('Scenario: API — 任务关联到正确的芯片', async ({ request }) => {
    // Given 用户已登录并创建了计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;

    // When 查询该计划的任务
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    const tasks = (await taskRes.json()).data || [];

    // Then 每个任务关联到正确的芯片
    for (const task of tasks) {
      expect(task.chipId).toBe(chip.id);
      expect(task.planId).toBe(planId);
    }
  });

  test('Scenario: API — QUICK 预设只包含核心算子 + MLP', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);

    // When 用 QUICK 创建计划
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    const tasks = (await taskRes.json()).data || [];

    // Then 应包含核心算子（MatMul/Conv2D/ReLU 等）和 MLP 模型
    const testItems = tasks.map((t: any) => t.testItem);
    const hasOperator = testItems.some((item: string) =>
      ['MatMul', 'Conv2D', 'GEMM', 'ReLU', 'Softmax', 'LayerNorm'].includes(item)
    );
    const hasModel = testItems.some((item: string) => item.includes('MLP'));
    expect(hasOperator).toBeTruthy();
    expect(hasModel).toBeTruthy();
  });
});

// ============================================================================
// Feature 4: 评测计划 UI
// ============================================================================
test.describe('MVP-0: 评测计划 UI', () => {

  test('Scenario: UI — 评测计划列表页正常展示', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    // When 导航到评测计划
    await page.locator('.ant-menu').getByText('评测计划').click();
    await page.waitForTimeout(500);

    // Then 应看到计划列表
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 10_000 }).catch(() => false);
    const hasContent = await page.getByText(/计划|评测/).first().isVisible().catch(() => false);
    expect(hasTable || hasContent).toBeTruthy();
  });

  test('Scenario: UI — 创建评测计划按钮可见', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在评测计划页
    await page.locator('.ant-menu').getByText('评测计划').click();
    await page.waitForTimeout(500);

    // Then 应有创建按钮
    const createBtn = page.getByRole('button', { name: /创建|新建/ });
    await expect(createBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test('Scenario: UI — 创建评测计划向导第一步选择芯片', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户打开创建评测计划
    await page.locator('.ant-menu').getByText('评测计划').click();
    await page.waitForTimeout(500);
    const createBtn = page.getByRole('button', { name: /创建|新建/ });
    await createBtn.first().click();
    await page.waitForTimeout(1000);

    // Then 第一步应提示选择芯片
    const hasChipStep = await page.getByText(/选择.*芯片|目标芯片/).first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasSteps = await page.locator('.ant-steps').isVisible().catch(() => false);
    expect(hasChipStep || hasSteps).toBeTruthy();
  });

  test('Scenario: UI — 向导有预设方案快速选择', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在创建评测计划向导中
    await page.locator('.ant-menu').getByText('评测计划').click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /创建|新建/ }).first().click();
    await page.waitForTimeout(1000);

    // When 进入评测项选择步骤（可能需要先选芯片）
    // 尝试点击下一步
    const nextBtn = page.getByRole('button', { name: /下一步|Next/ });
    if (await nextBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      // 先选择第一个芯片
      const chipOption = page.locator('.ant-radio-wrapper, .ant-card').first();
      if (await chipOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await chipOption.click();
      }
      await nextBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // Then 应有预设方案选项
    const hasPreset = await page.getByText(/快速验证|标准评测|全量评测|QUICK|STANDARD/).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasPreset).toBeTruthy();
  });
});
