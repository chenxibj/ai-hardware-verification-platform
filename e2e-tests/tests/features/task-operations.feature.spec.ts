/**
 * Feature: 任务操作
 *
 * API 功能测试。UI 弹窗/列表测试已移除 (CI 只保留功能测试)。
 *
 * Note: 独立创建的 CUSTOM 任务不会自动执行，所以取消/重试后不 poll。
 */
import { test, expect, apiLogin, apiPost, apiGet, apiDelete } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 任务操作 API', () => {
  test('Scenario: 取消正在执行的任务', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Cancel-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{}',
    });
    const taskId = (await createRes.json()).data.id;
    const cancelRes = await apiPost(request, token, `/tasks/${taskId}/cancel`);
    expect(cancelRes.ok()).toBeTruthy();
    const cancelBody = await cancelRes.json();
    expect(cancelBody.code).toBe(0);
    expect(['CANCELLED', 'COMPLETED', 'FAILED']).toContain(cancelBody.data.status);
  });

  test('Scenario: 重试已取消的任务', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Retry-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{}',
    });
    const taskId = (await createRes.json()).data.id;
    await apiPost(request, token, `/tasks/${taskId}/cancel`);
    const retryRes = await apiPost(request, token, `/tasks/${taskId}/retry`);
    const retryBody = await retryRes.json();
    if (retryBody.code === 0) {
      expect(['PENDING', 'QUEUED', 'RUNNING']).toContain(retryBody.data.status);
    }
    // Cleanup
    await apiPost(request, token, `/tasks/${taskId}/cancel`);
  });

  test('Scenario: 克隆任务创建副本', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-CloneOrig-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{}',
    });
    const originalId = (await createRes.json()).data.id;
    await new Promise((r) => setTimeout(r, 1000));
    const cloneRes = await apiPost(request, token, `/tasks/${originalId}/clone`);
    expect(cloneRes.ok()).toBeTruthy();
    const cloneBody = await cloneRes.json();
    expect(cloneBody.code).toBe(0);
    const clonedTask = cloneBody.data;
    expect(clonedTask.id).not.toBe(originalId);
    expect(clonedTask.taskNo).toBeTruthy();
    expect(clonedTask.name).toContain('副本');
    expect(['PENDING', 'QUEUED']).toContain(clonedTask.status);
    // Cleanup
    await apiPost(request, token, `/tasks/${originalId}/cancel`);
    await apiPost(request, token, `/tasks/${clonedTask.id}/cancel`);
  });

  test('Scenario: 查看任务详情', async ({ request }) => {
    const { token } = await apiLogin(request);
    const listRes = await apiGet(request, token, '/tasks');
    const tasks = (await listRes.json()).data;
    expect(tasks.length).toBeGreaterThan(0);
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const task = body.data;
    expect(task.id).toBe(taskId);
    expect(task.taskNo).toMatch(/^(EVT|TASK)-/);
    expect(task.evalType).toBeTruthy();
    expect(task.createdAt).toBeTruthy();
    expect(task.createdBy).toBeGreaterThan(0);
  });

  test('Scenario: 批量取消任务', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res1 = await apiPost(request, token, '/tasks', {
      name: `BDD-Batch1-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{}',
    });
    const id1 = (await res1.json()).data.id;
    const res2 = await apiPost(request, token, '/tasks', {
      name: `BDD-Batch2-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{}',
    });
    const id2 = (await res2.json()).data.id;
    await new Promise((r) => setTimeout(r, 500));
    const batchRes = await apiPost(request, token, '/tasks/batch/cancel', {
      ids: [id1, id2],
    });
    expect(batchRes.ok()).toBeTruthy();
    const batchBody = await batchRes.json();
    expect(batchBody.code).toBe(0);
  });

  test('Scenario: 健康检查端点可访问', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.status).toBe('UP');
    expect(body.data.components.database).toBe('UP');
    expect(body.data.components.redis).toBe('UP');
  });

  test('Scenario: 计算节点列表可查询', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/nodes');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toBeTruthy();
    expect(Array.isArray(body.data)).toBe(true);
    const onlineNodes = body.data.filter((n: any) => n.status === 'ONLINE');
    expect(onlineNodes.length).toBeGreaterThan(0);
  });

  test('Scenario: 暂停运行中的任务并恢复', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Pause-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{}',
    });
    const taskId = (await createRes.json()).data.id;
    await new Promise(r => setTimeout(r, 2000));
    const pauseRes = await apiPost(request, token, `/tasks/${taskId}/pause`);
    const pauseBody = await pauseRes.json();
    if (pauseBody.code === 0) {
      const taskRes = await apiGet(request, token, `/tasks/${taskId}`);
      const taskData = (await taskRes.json()).data;
      expect(taskData.status).toBe('PAUSED');
      const resumeRes = await apiPost(request, token, `/tasks/${taskId}/resume`);
      const resumeBody = await resumeRes.json();
      if (resumeBody.code === 0) {
        const resumed = (await (await apiGet(request, token, `/tasks/${taskId}`)).json()).data;
        expect(['PENDING', 'RUNNING', 'QUEUED']).toContain(resumed.status);
      }
    }
    await apiPost(request, token, `/tasks/${taskId}/cancel`);
  });
});
