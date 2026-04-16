/**
 * Feature: 评测任务全生命周期
 *
 * API 功能测试。UI 创建向导测试已移除 (CI 只保留功能测试)。
 * 
 * Note: 独立创建的 CUSTOM 任务不会自动执行（需要 plan + node），
 * 所以这里只验证创建、查询、状态操作，不 poll 等待完成。
 */
import { test, expect, apiLogin, apiPost, apiGet } from '../../fixtures/auth.fixture';

test.describe('Feature: 评测任务全生命周期 API', () => {
  test('Scenario: 通过 API 创建任务并验证初始状态', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Lifecycle-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{}',
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();
    expect(createBody.code).toBe(0);
    const task = createBody.data;
    expect(task.id).toBeTruthy();
    expect(task.taskNo).toMatch(/^(EVT|TASK)-/);
    expect(['PENDING', 'QUEUED']).toContain(task.status);
    expect(task.evalType).toBe('PERFORMANCE');
    expect(task.name).toContain('BDD-Lifecycle');

    // Cancel the task to clean up
    const cancelRes = await apiPost(request, token, `/tasks/${task.id}/cancel`);
    expect(cancelRes.ok()).toBeTruthy();
  });

  test('Scenario: 创建任务后立即查询能看到该任务', async ({ request }) => {
    const { token } = await apiLogin(request);
    const name = `BDD-Query-${Date.now()}`;
    const createRes = await apiPost(request, token, '/tasks', {
      name,
      taskType: 'CUSTOM',
      evalType: 'ACCURACY',
      priority: 'MEDIUM',
      evalConfig: '{}',
    });
    expect(createRes.ok()).toBeTruthy();
    const taskId = (await createRes.json()).data.id;

    // Verify in list
    const listRes = await apiGet(request, token, '/tasks');
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    expect(listBody.code).toBe(0);
    const found = listBody.data.find((t: any) => t.id === taskId);
    expect(found).toBeTruthy();
    expect(found.name).toBe(name);

    // Verify detail
    const getRes = await apiGet(request, token, `/tasks/${taskId}`);
    expect(getRes.ok()).toBeTruthy();
    const getBody = await getRes.json();
    expect(getBody.data.name).toBe(name);
    expect(getBody.data.evalType).toBe('ACCURACY');

    // Cleanup
    await apiPost(request, token, `/tasks/${taskId}/cancel`);
  });

  test('Scenario: 创建不同类型的评测任务都成功', async ({ request }) => {
    const { token } = await apiLogin(request);
    const evalConfigs = [
      { evalType: 'PERFORMANCE', name: 'BDD-芯片' },
      { evalType: 'COMPATIBILITY', name: 'BDD-框架' },
    ];
    for (const cfg of evalConfigs) {
      const res = await apiPost(request, token, '/tasks', {
        name: `${cfg.name}-${Date.now()}`,
        taskType: 'CUSTOM',
        evalType: cfg.evalType,
        priority: 'LOW',
        evalConfig: '{}',
      });
      expect(res.ok(), `Should create ${cfg.name} task`).toBeTruthy();
      const body = await res.json();
      expect(body.code).toBe(0);
      expect(body.data.evalType).toBe(cfg.evalType);
      expect(['PENDING', 'QUEUED']).toContain(body.data.status);

      // Cleanup
      await apiPost(request, token, `/tasks/${body.data.id}/cancel`);
    }
  });

  test('Scenario: 任务统计 API 返回正确数据', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/tasks/stats');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('completed');
    expect(body.data).toHaveProperty('failed');
    expect(body.data).toHaveProperty('running');
    expect(body.data).toHaveProperty('pending');
    expect(body.data.total).toBeGreaterThanOrEqual(0);
  });

  test('Scenario: 通过计划创建的任务可自动执行到完成', async ({ request }) => {
    test.setTimeout(180_000);
    const { token } = await apiLogin(request);

    // Find a completed plan
    const plansRes = await apiGet(request, token, '/plans?status=COMPLETED&size=1');
    const plans = (await plansRes.json()).data || [];
    test.skip(plans.length === 0, '无已完成计划，跳过执行验证');

    const planId = plans[0].id;
    const tasksRes = await apiGet(request, token, `/plans/${planId}/tasks`);
    const tasks = (await tasksRes.json()).data || [];
    expect(tasks.length).toBeGreaterThan(0);

    // All tasks should be in terminal state
    for (const task of tasks) {
      expect(['COMPLETED', 'FAILED']).toContain(task.status);
    }

    // At least one should be COMPLETED
    const completed = tasks.filter((t: any) => t.status === 'COMPLETED');
    expect(completed.length).toBeGreaterThan(0);
  });
});
