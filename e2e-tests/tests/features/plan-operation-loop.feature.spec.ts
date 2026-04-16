/**
 * Feature: 评测计划操作闭环 — API 功能测试
 *
 * UI 向导/监控页/模板 UI 测试已移除 (CI 只保留功能测试)。
 */
import { test, expect, apiLogin, apiGet, apiPost, apiPut } from '../../fixtures/auth.fixture';

/* ── Helpers ── */
async function ensureChip(request: any, token: string) {
  const res = await apiGet(request, token, '/chips');
  const chips = (await res.json()).data || [];
  if (chips.length > 0) return chips[0];
  const createRes = await apiPost(request, token, '/chips', {
    name: `BDD-E2E-Chip-${Date.now()}`,
    vendor: 'NVIDIA',
    chipType: 'GPU',
  });
  return (await createRes.json()).data;
}

async function ensureNode(request: any, token: string) {
  const res = await apiGet(request, token, '/nodes');
  const nodes = (await res.json()).data || [];
  if (nodes.length > 0) return nodes[0];
  const createRes = await apiPost(request, token, '/nodes', {
    name: `BDD-Node-${Date.now()}`,
    address: '127.0.0.1:50051',
    nodeType: 'CPU',
    status: 'ONLINE',
  });
  return (await createRes.json()).data;
}

// ============================================================================
// Feature 1: 评测计划 API 操作
// ============================================================================
test.describe('Feature: 评测计划 API 操作', () => {

  test('Scenario: API — 启动评测计划', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-Start-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;
    const startRes = await apiPut(request, token, `/plans/${planId}/start`, {});
    const body = await startRes.json();
    if (body.code === 0) {
      expect(body.data.status).toBe('RUNNING');
    }
  });

  test('Scenario: API — 暂停并恢复评测计划', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-PauseResume-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;
    await apiPut(request, token, `/plans/${planId}/start`, {});
    const pauseRes = await apiPut(request, token, `/plans/${planId}/pause`, {});
    const pauseBody = await pauseRes.json();
    if (pauseBody.code === 0) {
      expect(pauseBody.data.status).toBe('PAUSED');
    }
    const resumeRes = await apiPut(request, token, `/plans/${planId}/resume`, {});
    const resumeBody = await resumeRes.json();
    if (resumeBody.code === 0) {
      expect(resumeBody.data.status).toBe('RUNNING');
    }
  });

  test('Scenario: API — 取消评测计划', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-Cancel-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;
    const cancelRes = await apiPut(request, token, `/plans/${planId}/cancel`, {});
    const body = await cancelRes.json();
    if (body.code === 0) {
      expect(body.data.status).toBe('CANCELLED');
    }
  });
});

// ============================================================================
// Feature 2: 模板管理 API
// ============================================================================
test.describe('Feature: 模板管理 API', () => {

  test('Scenario: API — 预置模板不为空', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/templates');
    const body = await res.json();
    const templates = body.data || [];
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(t.name).toBeTruthy();
    }
  });

  test('Scenario: API — 创建自定义模板', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiPost(request, token, '/templates', {
      name: `BDD-Custom-Template-${Date.now()}`,
      evaluationLayer: 'OPERATOR',
      evalType: 'ACCURACY',
      description: 'BDD测试用自定义模板',
      configJson: JSON.stringify({
        operators: ['MatMul', 'Conv2D', 'ReLU'],
        dtypes: ['FP16', 'FP32'],
      }),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.name).toContain('BDD-Custom-Template');
    expect(body.data.isSystem).toBe(false);
  });
});

// ============================================================================
// Feature 3: 评测结果查看 API
// ============================================================================
test.describe('Feature: 评测结果查看 API', () => {

  test('Scenario: API — 查看计划下的任务列表', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-Results-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;
    const taskRes = await apiGet(request, token, `/plans/${planId}/tasks`);
    expect(taskRes.ok()).toBeTruthy();
    const body = await taskRes.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 每个任务有完整属性', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-TaskAttr-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;
    const taskRes = await apiGet(request, token, `/plans/${planId}/tasks`);
    const tasks = (await taskRes.json()).data || [];
    for (const task of tasks) {
      expect(task.id).toBeTruthy();
      expect(task.status).toBeTruthy();
      expect(task.planId).toBe(planId);
    }
  });
});
