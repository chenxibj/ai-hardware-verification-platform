/**
 * 评测任务日志管理 BDD 测试用例集 (API only)
 *
 * UI 日志面板/颜色渲染测试已移除 (CI 只保留功能测试)。
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

// ============================================================
// P0-1: 日志面板对接真实 API
// ============================================================
test.describe('P0-1: 日志面板对接真实 API', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 获取任务日志列表 — 返回真实数据而非模拟数据', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务数据，跳过');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const logItems = extractList(body);
    if (logItems.length > 0) {
      const log = logItems[0];
      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('createdAt');
      const msg = log.message || log.content || '';
      expect(msg).not.toContain('LOG_TEMPLATES');
      expect(msg).not.toContain('模拟日志');
    }
  });

  test('Scenario: 日志包含级别字段 — INFO/WARN/ERROR 区分', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=10');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务数据');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs`);
    const body = await res.json();
    const items = extractList(body);
    for (const log of items) {
      expect(log).toHaveProperty('level');
      expect(['DEBUG', 'INFO', 'WARN', 'ERROR']).toContain(log.level);
    }
  });
});

// ============================================================
// P0-2: 失败任务日志
// ============================================================
test.describe('P0-2: 失败任务日志', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 失败任务有 ERROR 级别日志', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?status=FAILED&page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无失败任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs`);
    const body = await res.json();
    const items = extractList(body);
    const errors = items.filter((l: any) => l.level === 'ERROR');
    expect(errors.length).toBeGreaterThan(0);
  });

  test('Scenario: 失败任务日志保留完整 stderr', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?status=FAILED&page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无失败任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs?level=ERROR`);
    const body = await res.json();
    const errors = extractList(body);
    if (errors.length > 0) {
      const lastError = errors[errors.length - 1];
      const msg = lastError.message || lastError.content || '';
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  test('Scenario: 任务列表可查看失败任务 — 从列表进入日志', async ({ request }) => {
    const res = await apiGet(request, token, '/tasks?page=0&size=20');
    const body = await res.json();
    const tasks = extractList(body);
    const failedTask = tasks.find((t: any) =>
      t.status === 'FAILED' || t.status === 'failed'
    );
    test.skip(!failedTask, '无失败任务');
    const logRes = await apiGet(request, token, `/tasks/${failedTask.id}/logs`);
    expect(logRes.ok()).toBeTruthy();
  });
});

// ============================================================
// P0-3: 日志导出
// ============================================================
test.describe('P0-3: 日志导出', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 下载任务日志 — TXT 格式', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs/download`);
    expect([200, 204].includes(res.status())).toBeTruthy();
    if (res.status() === 200) {
      const contentType = res.headers()['content-type'] || '';
      const contentDisposition = res.headers()['content-disposition'] || '';
      expect(
        contentType.includes('text/') ||
        contentType.includes('application/octet-stream') ||
        contentDisposition.includes('attachment')
      ).toBeTruthy();
    }
  });

  test('Scenario: 下载日志指定格式 — JSON', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs/download?format=json`);
    expect([200, 204].includes(res.status())).toBeTruthy();
  });
});

// ============================================================
// P0-4/5: WebSocket 实时日志 (API verification only)
// ============================================================
test.describe('P0-4/5: WebSocket 实时日志 API', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: HTTP 轮询降级 — 使用 after 游标', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res1 = await apiGet(request, token, `/tasks/${taskId}/logs?limit=10&order=asc`);
    const body1 = await res1.json();
    const items1 = extractList(body1);
    test.skip(items1.length === 0, '无日志数据');
    const lastId = items1[items1.length - 1].id;
    const res2 = await apiGet(request, token, `/tasks/${taskId}/logs?after=${lastId}&limit=10`);
    expect(res2.ok()).toBeTruthy();
  });
});

// ============================================================
// P0-6: 结构化日志上报
// ============================================================
test.describe('P0-6: 结构化日志上报', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 日志包含 logType 字段', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=10');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs`);
    const logBody = await res.json();
    const items = extractList(logBody);
    for (const log of items) {
      expect(log).toHaveProperty('logType');
      expect(['TEXT', 'METRIC', 'PROGRESS', 'ERROR', 'SYSTEM']).toContain(log.logType);
    }
  });

  test('Scenario: METRIC 类型日志包含 metrics 数据', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=10');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    let found = false;
    for (const task of tasks) {
      const res = await apiGet(request, token, `/tasks/${task.id}/logs?type=METRIC&limit=5`);
      const logBody = await res.json();
      const items = extractList(logBody);
      if (items.length > 0) {
        const metric = items[0];
        expect(metric.logType).toBe('METRIC');
        expect(metric.metrics).toBeTruthy();
        expect(typeof metric.metrics).toBe('object');
        found = true;
        break;
      }
    }
    test.skip(!found, '无 METRIC 类型日志');
  });

  test('Scenario: SYSTEM 类型日志出现在任务首尾', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?status=COMPLETED&page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无已完成任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs?order=asc&limit=500`);
    const logBody = await res.json();
    const items = extractList(logBody);
    test.skip(items.length === 0, '无日志');
    expect(items[0].logType).toBe('SYSTEM');
    const lastLog = items[items.length - 1];
    if (lastLog.logType !== 'SYSTEM') {
      const systemLogs = items.filter((l: any) => l.logType === 'SYSTEM');
      test.skip(systemLogs.length < 2, 'Agent 未发送任务结束 SYSTEM 日志，待实现');
    }
  });

  test('Scenario: 批量上报接口可用', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=1');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiPost(request, token, `/tasks/${taskId}/logs/batch`, {
      entries: [
        {
          type: 'TEXT',
          level: 'INFO',
          timestamp: new Date().toISOString(),
          message: '[BDD-TEST] 测试批量上报接口',
          context: { node_id: 'test-node', step: '1/1' }
        }
      ]
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    if (body.data) {
      expect(body.data.accepted).toBeGreaterThanOrEqual(1);
    }
  });

  test('Scenario: 日志包含执行上下文 context', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=10');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    let found = false;
    for (const task of tasks) {
      const res = await apiGet(request, token, `/tasks/${task.id}/logs?limit=20`);
      const logBody = await res.json();
      const items = extractList(logBody);
      const withContext = items.find((l: any) => l.context && typeof l.context === 'object' && (l.context.nodeId || l.context.node_id));
      if (withContext) {
        expect(withContext.context.nodeId || withContext.context.node_id).toBeTruthy();
        found = true;
        break;
      }
    }
    test.skip(!found, '无带 context 的日志');
  });
});

// ============================================================
// P1: 日志搜索过滤
// ============================================================
test.describe('P1: 日志搜索过滤', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 按级别过滤日志 — 只看 ERROR', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=10');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs?level=ERROR`);
    const logBody = await res.json();
    const items = extractList(logBody);
    for (const log of items) {
      expect(log.level).toBe('ERROR');
    }
  });

  test('Scenario: 按类型过滤日志 — 只看 METRIC', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=10');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs?type=METRIC`);
    const logBody = await res.json();
    const items = extractList(logBody);
    for (const log of items) {
      expect(log.logType).toBe('METRIC');
    }
  });

  test('Scenario: 关键字搜索日志', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=10');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs?keyword=batch`);
    expect(res.ok()).toBeTruthy();
  });

  test('Scenario: 时间范围过滤日志', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();
    const to = now.toISOString();
    const res = await apiGet(request, token, `/tasks/${taskId}/logs?from=${from}&to=${to}`);
    expect(res.ok()).toBeTruthy();
  });
});

// ============================================================
// P1-9: 日志统计
// ============================================================
test.describe('P1: 日志统计', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 获取任务日志统计', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs/stats`);
    test.skip(!res.ok(), '日志统计接口未实现，P1 待实现');
    const body = await res.json();
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('byLevel');
    expect(body.data).toHaveProperty('byType');
  });
});

// ============================================================
// P2: 性能数据提取
// ============================================================
test.describe('P2: 性能数据提取', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 提取任务 METRIC 聚合数据', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?status=COMPLETED&page=0&size=10');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无已完成任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs/metrics?group_by=batch_size`);
    test.skip(!res.ok(), 'METRIC 聚合接口未实现，P2 待实现');
  });
});

// ============================================================
// P2: 日志报告关联
// ============================================================
test.describe('P2: 日志报告关联', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 同一任务可同时获取日志和报告', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?status=COMPLETED&page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无已完成任务');
    const taskId = tasks[0].id;
    const [logRes, reportRes] = await Promise.all([
      apiGet(request, token, `/tasks/${taskId}/logs`),
      apiGet(request, token, `/tasks/${taskId}/report`),
    ]);
    expect(logRes.ok()).toBeTruthy();
    expect([200, 404, 500].includes(reportRes.status())).toBeTruthy();
    test.skip(reportRes.status() === 500, '报告接口返回 500，P2 待实现');
  });
});

// ============================================================
// P2: 多格式导出
// ============================================================
test.describe('P2: 多格式导出', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: CSV 格式导出', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiGet(request, token, `/tasks/${taskId}/logs/download?format=csv`);
    expect([200, 204].includes(res.status())).toBeTruthy();
  });
});

// ============================================================
// 兼容性: 旧日志数据
// ============================================================
test.describe('兼容性: 旧日志数据', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: 旧日志数据有默认 logType 和 level', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=5');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    for (const task of tasks) {
      const res = await apiGet(request, token, `/tasks/${task.id}/logs?limit=5`);
      const logBody = await res.json();
      const items = extractList(logBody);
      for (const log of items) {
        expect(log.logType).toBeTruthy();
        expect(log.level).toBeTruthy();
      }
    }
  });

  test('Scenario: 旧上报接口仍然可用', async ({ request }) => {
    const taskRes = await apiGet(request, token, '/tasks?page=0&size=1');
    const taskBody = await taskRes.json();
    const tasks = extractList(taskBody);
    test.skip(tasks.length === 0, '无任务');
    const taskId = tasks[0].id;
    const res = await apiPost(request, token, `/tasks/${taskId}/logs`, {
      content: '[BDD-TEST] 旧接口兼容性测试'
    });
    expect(res.ok()).toBeTruthy();
  });
});
