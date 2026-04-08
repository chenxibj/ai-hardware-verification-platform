/**
 * 评测日志 plan_id + 过程日志 E2E 验证
 * #244: 验证 plan_id 自动填充 + 评测脚本过程日志输出
 *
 * 前置条件: 已有一个完成的评测 Plan (plan_id=295 or latest)
 * 验证标准:
 *   1. task_logs 中每个 OPERATOR 任务日志 >= 10 条
 *   2. plan_id 不为空
 *   3. 日志包含 SYSTEM + TEXT/EVAL + PROGRESS + METRIC 多种类型
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

const BASE = process.env.API_BASE || 'http://39.97.251.94';

function extractList(body: any): any[] {
  const d = body?.data;
  if (Array.isArray(d)) return d;
  if (d?.items) return d.items;
  if (d?.list) return d.list;
  if (d?.content) return d.content;
  return [];
}

test.describe('#244: 评测日志 plan_id 自动填充 + 过程日志', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('评测任务完成后日志持久化 — plan_id 不为空', async ({ request }) => {
    // Find a completed plan
    const plansRes = await apiGet(request, token, '/plans?status=COMPLETED&page=0&size=1');
    const plansBody = await plansRes.json();
    const plans = extractList(plansBody);
    test.skip(plans.length === 0, '无已完成 Plan，跳过');

    const planId = plans[0].id;

    // Get tasks for this plan
    const tasksRes = await apiGet(request, token, `/plans/${planId}/tasks`);
    const tasksBody = await tasksRes.json();
    const tasks = extractList(tasksBody);
    expect(tasks.length).toBeGreaterThan(0);

    // For each OPERATOR task, check logs
    for (const task of tasks) {
      if (task.evalType !== 'OPERATOR') continue;

      const logsRes = await apiGet(request, token, `/tasks/${task.id}/logs?limit=200`);
      const logsBody = await logsRes.json();
      expect(logsBody.code).toBe(0);

      const logs = extractList(logsBody);

      // Verify at least 10 logs per operator task
      expect(logs.length).toBeGreaterThanOrEqual(10);

      // Verify all logs have plan_id
      for (const log of logs) {
        expect(log.planId).not.toBeNull();
        expect(log.planId).toBe(planId);
      }

      // Verify log type diversity
      const logTypes = new Set(logs.map((l: any) => l.logType));
      expect(logTypes.has('SYSTEM')).toBe(true);

      // Should have at least SYSTEM + one other type
      expect(logTypes.size).toBeGreaterThanOrEqual(2);
    }
  });

  test('OPERATOR 任务日志包含过程输出 — warmup/progress/metric', async ({ request }) => {
    // Find a completed plan
    const plansRes = await apiGet(request, token, '/plans?status=COMPLETED&page=0&size=1');
    const plansBody = await plansRes.json();
    const plans = extractList(plansBody);
    test.skip(plans.length === 0, '无已完成 Plan，跳过');

    const planId = plans[0].id;

    // Get OPERATOR tasks
    const tasksRes = await apiGet(request, token, `/plans/${planId}/tasks`);
    const tasksBody = await tasksRes.json();
    const tasks = extractList(tasksBody).filter((t: any) => t.evalType === 'OPERATOR');
    test.skip(tasks.length === 0, '无 OPERATOR 任务，跳过');

    const taskId = tasks[0].id;
    const logsRes = await apiGet(request, token, `/tasks/${taskId}/logs?limit=200`);
    const logsBody = await logsRes.json();
    const logs = extractList(logsBody);

    const messages = logs.map((l: any) => l.message || '');

    // Should have [EVAL] process logs
    const evalLogs = messages.filter((m: string) => m.includes('[EVAL]'));
    expect(evalLogs.length).toBeGreaterThanOrEqual(3);

    // Should have [METRIC] completion log
    const metricLogs = messages.filter((m: string) => m.includes('[METRIC]'));
    expect(metricLogs.length).toBeGreaterThanOrEqual(1);

    // Should have warmup log
    const warmupLogs = messages.filter((m: string) => m.includes('Warmup'));
    expect(warmupLogs.length).toBeGreaterThanOrEqual(1);

    // Should have progress log with percentage
    const progressLogs = messages.filter((m: string) => m.includes('进度') || m.includes('%'));
    expect(progressLogs.length).toBeGreaterThanOrEqual(1);
  });

  test('日志统计 API 返回多类型日志', async ({ request }) => {
    // Find a completed plan with OPERATOR tasks
    const plansRes = await apiGet(request, token, '/plans?status=COMPLETED&page=0&size=1');
    const plansBody = await plansRes.json();
    const plans = extractList(plansBody);
    test.skip(plans.length === 0, '无已完成 Plan，跳过');

    const planId = plans[0].id;
    const tasksRes = await apiGet(request, token, `/plans/${planId}/tasks`);
    const tasksBody = await tasksRes.json();
    const tasks = extractList(tasksBody).filter((t: any) => t.evalType === 'OPERATOR');
    test.skip(tasks.length === 0, '无 OPERATOR 任务，跳过');

    const taskId = tasks[0].id;

    // Check stats endpoint
    const statsRes = await apiGet(request, token, `/tasks/${taskId}/logs/stats`);
    const statsBody = await statsRes.json();
    expect(statsBody.code).toBe(0);

    const stats = statsBody.data;
    expect(stats.total).toBeGreaterThanOrEqual(10);

    // Should have SYSTEM type
    expect(stats.byType).toHaveProperty('SYSTEM');

    // Time range should exist
    expect(stats.timeRange.first).not.toBeNull();
    expect(stats.timeRange.last).not.toBeNull();
  });
});
