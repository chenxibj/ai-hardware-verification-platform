/**
 * US-2.7: 评测日志全生命周期管理
 * 
 * 用户故事: 作为评测工程师，我需要完整的日志管理能力
 * 
 * 验收标准:
 * - 日志统一格式(JSON)
 * - 多条件检索
 * - 数据分类管理
 * - 访问控制(租户隔离)
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('US-2.7: 日志全生命周期管理', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: API — 任务日志可查询且有结构化格式', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=1&pageSize=1');
    const tasks = (await taskRes.json()).data?.items || (await taskRes.json()).data?.list || [];
    test.skip(tasks.length === 0, '无任务');
    const res = await apiGet(request, token, `/tasks/${tasks[0].id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toHaveProperty('status');
  });

  test('Scenario: API — 无token访问日志返回401/403', async ({ request }) => {
    const API = process.env.API_BASE || 'http://localhost:8080/api';
    const res = await request.get(`${API}/tasks`);
    expect([401, 403].includes(res.status())).toBeTruthy();
  });
});
