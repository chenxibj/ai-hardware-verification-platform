/**
 * Feature: MVP-0 评测计划创建 + 预设方案 + 任务自动拆分
 *
 * API 功能测试。UI 向导测试已移除 (CI 只保留功能测试)。
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

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

// ============================================================================
// Feature 1: 评测计划创建 - API
// ============================================================================
test.describe('MVP-0: 评测计划创建', () => {

  test('Scenario: API — 创建评测计划关联芯片', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const res = await createPlan(request, token, chip.id, 'QUICK');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const plan = body.data;
    expect(plan.chipId).toBe(chip.id);
    expect(plan.name).toBeTruthy();
    expect(plan.status).toBeTruthy();
  });

  test('Scenario: API — 不指定芯片创建计划失败', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiPost(request, token, '/plans', {
      name: `BDD-NoChip-${Date.now()}`,
      preset: 'QUICK',
    });
    const body = await res.json();
    expect(body.code).not.toBe(0);
  });

  test('Scenario: API — 获取评测计划列表', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/plans');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Scenario: API — 按芯片 ID 筛选评测计划', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    await createPlan(request, token, chip.id, 'QUICK');
    const res = await apiGet(request, token, `/plans?chipId=${chip.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    for (const plan of body.data || []) {
      expect(plan.chipId).toBe(chip.id);
    }
  });

  test('Scenario: API — 按状态筛选评测计划', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/plans?status=COMPLETED');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for (const plan of body.data || []) {
      expect(plan.status).toBe('COMPLETED');
    }
  });

  test('Scenario: API — 查看评测计划详情', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;
    const res = await apiGet(request, token, `/plans/${planId}`);
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
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const res = await createPlan(request, token, chip.id, 'QUICK');
    const plan = (await res.json()).data;
    expect(plan.totalTasks).toBeGreaterThanOrEqual(5);
    expect(plan.totalTasks).toBeLessThanOrEqual(15);
  });

  test('Scenario: API — STANDARD 预设生成约 17 个任务', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const res = await createPlan(request, token, chip.id, 'STANDARD');
    const plan = (await res.json()).data;
    expect(plan.totalTasks).toBeGreaterThanOrEqual(10);
    expect(plan.totalTasks).toBeLessThanOrEqual(30);
  });

  test('Scenario: API — COMPREHENSIVE 预设生成最多任务', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const res = await createPlan(request, token, chip.id, 'COMPREHENSIVE');
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toBeTruthy();
    expect(body.data.totalTasks).toBeGreaterThan(15);
  });

  test('Scenario: API — 三种预设任务数严格递增', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const quickRes = await createPlan(request, token, chip.id, 'QUICK');
    const quickBody = await quickRes.json();
    expect(quickBody.code).toBe(0);
    const stdRes = await createPlan(request, token, chip.id, 'STANDARD');
    const stdBody = await stdRes.json();
    expect(stdBody.code).toBe(0);
    const compRes = await createPlan(request, token, chip.id, 'COMPREHENSIVE');
    const compBody = await compRes.json();
    expect(compBody.code).toBe(0);
    const quickTasks = quickBody.data.totalTasks;
    const stdTasks = stdBody.data.totalTasks;
    const compTasks = compBody.data.totalTasks;
    expect(stdTasks).toBeGreaterThan(quickTasks);
    expect(compTasks).toBeGreaterThan(stdTasks);
  });
});

// ============================================================================
// Feature 3: 任务自动拆分
// ============================================================================
test.describe('MVP-0: 任务自动拆分', () => {

  test('Scenario: API — 提交计划后自动生成评测任务', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    expect(taskRes.ok()).toBeTruthy();
    const body = await taskRes.json();
    const tasks = body.data || [];
    expect(tasks.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 每个任务有 testSubject 和 testItem', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    const tasks = (await taskRes.json()).data || [];
    for (const task of tasks) {
      expect(['OPERATOR', 'MODEL']).toContain(task.testSubject);
      expect(task.testItem).toBeTruthy();
    }
  });

  test('Scenario: API — 每个任务有 dimension 分类', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'STANDARD');
    const planId = (await planRes.json()).data.id;
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    const tasks = (await taskRes.json()).data || [];
    for (const task of tasks) {
      expect(task.dimension).toBeTruthy();
    }
  });

  test('Scenario: API — 任务关联到正确的芯片', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    const tasks = (await taskRes.json()).data || [];
    for (const task of tasks) {
      expect(task.chipId).toBe(chip.id);
      expect(task.planId).toBe(planId);
    }
  });

  test('Scenario: API — QUICK 预设只包含核心算子 + MLP', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await createPlan(request, token, chip.id, 'QUICK');
    const planId = (await planRes.json()).data.id;
    const taskRes = await apiGet(request, token, `/tasks?planId=${planId}`);
    const tasks = (await taskRes.json()).data || [];
    const testItems = tasks.map((t: any) => t.testItem);
    const hasOperator = testItems.some((item: string) =>
      ['MatMul', 'Conv2D', 'GEMM', 'ReLU', 'Softmax', 'LayerNorm'].includes(item)
    );
    const hasModel = testItems.some((item: string) => item.includes('MLP'));
    expect(hasOperator).toBeTruthy();
    expect(hasModel).toBeTruthy();
  });
});
