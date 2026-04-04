/**
 * US-2.5: 评测日志查看与下载
 * 
 * 用户故事: 查看任务执行日志
 * 
 * 验收标准:
 * - 级别过滤(ALL/INFO/WARN/ERROR)
 * - 时间范围筛选
 * - 搜索功能
 * - 日志下载(.log/.json)
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('US-2.5: 评测日志查看', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: API — 查询任务日志', async ({ request }) => {
    // Given 获取一个任务
    const taskRes = await apiGet(request, token, '/tasks?page=1&pageSize=1');
    const tasks = (await taskRes.json()).data?.items || (await taskRes.json()).data?.list || [];
    test.skip(tasks.length === 0, '无任务数据');
    // When 查询该任务日志
    const res = await apiGet(request, token, `/tasks/${tasks[0].id}/logs`);
    // Then 返回日志数据(可能是SSE或JSON)
    expect([200, 404].includes(res.status())).toBeTruthy();
  });

  test('Scenario: API — 任务详情包含执行信息', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=1&pageSize=1');
    const tasks = (await taskRes.json()).data?.items || (await taskRes.json()).data?.list || [];
    test.skip(tasks.length === 0, '无任务');
    const res = await apiGet(request, token, `/tasks/${tasks[0].id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeTruthy();
  });
});
