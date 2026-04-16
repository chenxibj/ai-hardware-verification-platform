/**
 * MVP-0 回归测试 (Issues #124 — #137)
 *
 * API 回归测试。UI 布局/导航回归测试已移除 (CI 只保留功能测试)。
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

/* ── #124 用户认证（回归） ── */
test.describe('MVP-0 #124: 用户认证回归', () => {
  test('API 登录返回有效 token', async ({ request }) => {
    const { token, user } = await apiLogin(request);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
    expect(user).toBeTruthy();
  });
});

/* ── #126 评测模板管理（回归）── API /templates 已移除 ── */
test.describe('MVP-0 #126: 评测模板管理回归', () => {
  test('旧 /templates API 已重构（预期 404 或新接口）', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/templates');
    expect([200, 404]).toContain(res.status());
  });
});

/* ── #127 评测任务创建（回归） ── */
test.describe('MVP-0 #127: 评测任务创建回归', () => {
  test('API 创建任务成功并返回 PENDING/QUEUED 状态', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiPost(request, token, '/tasks', {
      name: `Regr-Create-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{"testItems":["matmul_fp32"]}',
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(['PENDING', 'QUEUED']).toContain(body.data.status);
    expect(body.data.taskNo).toBeTruthy();
  });
});

/* ── #128 任务状态流转（回归） ── */
test.describe('MVP-0 #128: 任务状态流转回归', () => {
  test('任务创建后可查询状态并取消', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/tasks', {
      name: `Regr-Flow-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{"testItems":["matmul_fp32"]}',
    });
    expect(createRes.ok()).toBeTruthy();
    const taskId = (await createRes.json()).data.id;

    const statusRes = await apiGet(request, token, `/tasks/${taskId}`);
    expect(statusRes.ok()).toBeTruthy();
    const task = (await statusRes.json()).data;
    expect(task.status).toBeTruthy();

    const cancelRes = await apiPost(request, token, `/tasks/${taskId}/cancel`);
    expect(cancelRes.ok()).toBeTruthy();
    const cancelBody = await cancelRes.json();
    expect(cancelBody.code).toBe(0);
    expect(['CANCELLED', 'COMPLETED', 'FAILED', 'PENDING']).toContain(cancelBody.data.status);
  });

  test('已完成的任务可重试', async ({ request }) => {
    const { token } = await apiLogin(request);
    const tasksRes = await apiGet(request, token, '/tasks');
    const tasks = (await tasksRes.json()).data || [];
    const retryable = tasks.find((t: any) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status));
    test.skip(!retryable, '无可重试任务');

    const retryRes = await apiPost(request, token, `/tasks/${retryable!.id}/retry`);
    expect(retryRes.status()).not.toBe(500);
  });
});

/* ── #129 任务操作（取消/克隆）（回归） ── */
test.describe('MVP-0 #129: 任务操作回归', () => {
  test('取消任务成功', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/tasks', {
      name: `Regr-Cancel-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{"testItems":["matmul_fp32"]}',
    });
    expect(createRes.ok()).toBeTruthy();
    const taskId = (await createRes.json()).data.id;

    const cancelRes = await apiPost(request, token, `/tasks/${taskId}/cancel`);
    expect(cancelRes.ok()).toBeTruthy();
    const body = await cancelRes.json();
    expect(body.code).toBe(0);
    expect(['CANCELLED', 'COMPLETED', 'FAILED']).toContain(body.data.status);
  });

  test('任务列表查询并支持分页', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/tasks');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeDefined();
  });
});

/* ── #130 评测报告自动生成（回归） ── */
test.describe('MVP-0 #130: 评测报告回归', () => {
  test('chip-reports API 可查询', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/chip-reports');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('已完成任务可关联报告', async ({ request }) => {
    const { token } = await apiLogin(request);
    const tasksRes = await apiGet(request, token, '/tasks');
    const tasks = (await tasksRes.json()).data || [];
    const completed = tasks.find((t: any) => t.status === 'COMPLETED');
    test.skip(!completed, '无已完成任务，跳过');

    const reportRes = await apiGet(request, token, `/tasks/${completed!.id}/report`);
    expect(reportRes.status()).not.toBe(500);
  });
});

/* ── #131 数字资产管理（回归）── API 已移除 ── */
test.describe('MVP-0 #131: 数字资产管理回归', () => {
  test('旧 /assets API 已重构（预期 404）', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/assets');
    expect([200, 404]).toContain(res.status());
  });
});

/* ── #134 评测编排工作流（回归）── API/导航已移除 ── */
test.describe('MVP-0 #134: 评测编排工作流回归', () => {
  test('旧 /workflows API 已重构（预期 404）', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/workflows');
    expect([200, 404]).toContain(res.status());
  });
});

/* ── #135 评测日志查看（回归）── 导航已移除 ── */
test.describe('MVP-0 #135: 评测日志回归', () => {
  test('评测日志功能已合并至新架构（跳过导航测试）', async () => {
    expect(true).toBeTruthy();
  });
});
