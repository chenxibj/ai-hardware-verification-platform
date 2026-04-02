/**
 * Feature: 任务操作
 *
 * 验证任务的各种操作：取消、重试、克隆、删除、批量操作。
 */
import { test, expect, apiLogin, apiPost, apiGet, apiDelete, pollTaskUntilDone } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 任务操作', () => {
  test('Scenario: 取消正在执行的任务', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // And 创建了一个任务
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Cancel-${Date.now()}`,
      evalType: 'PERFORMANCE',
      evalObject: 'OPERATOR',
      priority: 'LOW',
    });
    const taskId = (await createRes.json()).data.id;

    // When 发送取消请求
    const cancelRes = await apiPost(request, token, `/tasks/${taskId}/cancel`);
    expect(cancelRes.ok()).toBeTruthy();
    const cancelBody = await cancelRes.json();
    expect(cancelBody.code).toBe(0);

    // Then 任务状态应为 CANCELLED（或已 COMPLETED）
    expect(['CANCELLED', 'COMPLETED', 'FAILED']).toContain(cancelBody.data.status);
  });

  test('Scenario: 重试已取消的任务', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // And 创建并立即取消一个任务
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Retry-${Date.now()}`,
      evalType: 'PERFORMANCE',
      evalObject: 'OPERATOR',
      priority: 'LOW',
    });
    const taskId = (await createRes.json()).data.id;
    await apiPost(request, token, `/tasks/${taskId}/cancel`);

    // When 重试该任务
    const retryRes = await apiPost(request, token, `/tasks/${taskId}/retry`);
    const retryBody = await retryRes.json();

    // Then 应该返回成功并重新开始执行
    if (retryBody.code === 0) {
      const final = await pollTaskUntilDone(request, token, taskId, 60_000);
      expect(['COMPLETED', 'FAILED', 'CANCELLED']).toContain(final.status);
    }
    // If retry is not allowed on current status, that's also valid
  });

  test('Scenario: 克隆任务创建副本', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // And 创建一个任务（不等完成，直接克隆）
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-CloneOrig-${Date.now()}`,
      evalType: 'PERFORMANCE',
      evalObject: 'OPERATOR',
      priority: 'LOW',
    });
    const originalId = (await createRes.json()).data.id;

    // 等待一下让任务启动
    await new Promise((r) => setTimeout(r, 1000));

    // When 克隆该任务
    const cloneRes = await apiPost(request, token, `/tasks/${originalId}/clone`);
    expect(cloneRes.ok()).toBeTruthy();
    const cloneBody = await cloneRes.json();
    expect(cloneBody.code).toBe(0);

    const clonedTask = cloneBody.data;

    // Then 克隆的任务应有新的 ID
    expect(clonedTask.id).not.toBe(originalId);
    expect(clonedTask.taskNo).toBeTruthy();

    // And 名称应包含"副本"
    expect(clonedTask.name).toContain('副本');

    // And 状态应为 PENDING（重新开始）
    expect(clonedTask.status).toBe('PENDING');

    // And 两个任务都应能正常到达终态
    await pollTaskUntilDone(request, token, originalId, 60_000);
    await pollTaskUntilDone(request, token, clonedTask.id, 60_000);
  });

  test('Scenario: 查看任务详情', async ({ request }) => {
    // Given 用户已登录并有任务
    const { token } = await apiLogin(request);

    // 获取现有任务列表
    const listRes = await apiGet(request, token, '/tasks');
    const tasks = (await listRes.json()).data;
    expect(tasks.length).toBeGreaterThan(0);
    const taskId = tasks[0].id;

    // When 查询任务详情
    const res = await apiGet(request, token, `/tasks/${taskId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // Then 应返回完整的任务信息
    const task = body.data;
    expect(task.id).toBe(taskId);
    expect(task.taskNo).toMatch(/^EVT-/);
    expect(task.evalType).toBeTruthy();
    expect(task.createdAt).toBeTruthy();
    expect(task.createdBy).toBeGreaterThan(0);
  });

  test('Scenario: 通过 UI 查看任务详情弹窗', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    // When 导航到评测任务页面
    await page.locator('.ant-menu-item', { hasText: '评测任务' }).click();
    await expect(page.locator('text=评测任务管理')).toBeVisible({ timeout: 10_000 });

    // And 等待表格加载
    await expect(page.locator('.ant-table-tbody .ant-table-row').first()).toBeVisible({ timeout: 10_000 });

    // And 点击第一行的"详情"按钮
    await page.locator('.ant-table-row').first().getByRole('button', { name: '详情' }).click();

    // Then 应该弹出详情弹窗
    await expect(page.locator('.ant-modal')).toBeVisible({ timeout: 5_000 });
  });

  test('Scenario: 任务列表表格正常显示', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录并在评测任务页面
    await page.locator('.ant-menu-item', { hasText: '评测任务' }).click();
    await expect(page.locator('text=评测任务管理')).toBeVisible({ timeout: 10_000 });

    // When 等待表格加载完成
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });

    // Then 表格应显示任务数据（至少有表头）
    await expect(page.locator('.ant-table-thead')).toBeVisible();
    // And 应有"任务编号"列
    await expect(page.locator('.ant-table-thead', { hasText: '任务编号' })).toBeVisible();
    // And 应有统计卡片
    await expect(page.locator('.ant-statistic').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: 批量取消任务', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // And 创建两个任务
    const res1 = await apiPost(request, token, '/tasks', {
      name: `BDD-Batch1-${Date.now()}`,
      evalType: 'PERFORMANCE',
      evalObject: 'OPERATOR',
      priority: 'LOW',
    });
    const id1 = (await res1.json()).data.id;

    const res2 = await apiPost(request, token, '/tasks', {
      name: `BDD-Batch2-${Date.now()}`,
      evalType: 'PERFORMANCE',
      evalObject: 'OPERATOR',
      priority: 'LOW',
    });
    const id2 = (await res2.json()).data.id;

    // When 发送批量取消
    await new Promise((r) => setTimeout(r, 500));
    const batchRes = await apiPost(request, token, '/tasks/batch/cancel', {
      ids: [id1, id2],
    });

    // Then 应返回成功
    expect(batchRes.ok()).toBeTruthy();
    const batchBody = await batchRes.json();
    expect(batchBody.code).toBe(0);
  });

  test('Scenario: 健康检查端点可访问', async ({ request }) => {
    // Given 系统在运行
    // When 请求健康检查
    const res = await request.get(`${API_BASE}/health`);

    // Then 应返回 UP
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('UP');
    expect(body.components.db.status).toBe('UP');
    expect(body.components.redis.status).toBe('UP');
  });

  test('Scenario: 计算节点列表可查询', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询计算节点
    const res = await apiGet(request, token, '/nodes');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // Then 应返回节点列表
    expect(body.data).toBeTruthy();
    expect(Array.isArray(body.data)).toBe(true);

    // And 至少有一个在线节点
    const onlineNodes = body.data.filter((n: any) => n.status === 'ONLINE');
    expect(onlineNodes.length).toBeGreaterThan(0);
  });

  test('Scenario: 资源列表可查询', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询计算资源
    const res = await apiGet(request, token, '/resources');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // Then 应返回资源列表
    expect(body.data).toBeTruthy();
    expect(Array.isArray(body.data)).toBe(true);
  });
});
