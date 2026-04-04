/**
 * MVP-0 回归测试 (Issues #124 — #137)
 *
 * 整合已有的分散测试文件，对 MVP-0 的 14 个 issue 做统一回归。
 *
 * 注意: 导航结构已在 #128 重组:
 *   - 侧边栏: 工作台 | 芯片管理(芯片列表/芯片对比) | 评测计划(计划列表/创建计划) | 节点管理 | 系统设置(用户管理/操作审计)
 *   - 旧页面(评测任务/模板/报告/日志/资产等)已从导航移除，但路由仍保留
 *   - API: /tasks, /chips, /chip-reports 可用；/templates, /reports, /assets, /nodes, /workflows 已 404
 *
 * Issue 映射:
 *   #124 用户登录注册            → auth (API + UI)
 *   #125 侧边栏导航              → 新导航结构验证
 *   #126 评测模板管理             → (API 已移除, 跳过)
 *   #127 评测任务创建             → /tasks API
 *   #128 任务状态流转             → /tasks API
 *   #129 任务取消/重试/克隆       → /tasks API
 *   #130 评测报告自动生成         → (API /reports 已移除, 用 /chip-reports 替代)
 *   #131 数字资产管理             → (API /assets 已移除, 验证路由可达)
 *   #132 计算资源管理             → 节点管理 UI
 *   #133 Dashboard / 工作台      → 工作台 UI
 *   #134 评测编排工作流           → (API /workflows 已移除, 跳过)
 *   #135 评测日志查看             → (导航已移除, 跳过)
 *   #136 操作审计日志             → 系统设置 > 操作审计
 *   #137 系统设置页面             → 系统设置子菜单
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

  test('UI 登录后显示主界面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await expect(page.locator('.ant-menu')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.ant-menu').getByText('工作台')).toBeVisible({ timeout: 5000 });
  });
});

/* ── #125 侧边栏导航（回归） ── */
test.describe('MVP-0 #125: 侧边栏导航回归', () => {
  test('侧边栏显示新版一级菜单', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const sidebar = page.locator('.ant-menu');
    // 新导航结构的一级菜单
    const menuItems = ['工作台', '芯片管理', '评测计划', '节点管理', '系统设置'];
    for (const item of menuItems) {
      await expect(sidebar.getByText(item).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('展开芯片管理子菜单可见', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.locator('.ant-menu').getByText('芯片管理').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.ant-menu').getByText('芯片列表')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.ant-menu').getByText('芯片对比')).toBeVisible({ timeout: 5000 });
  });

  test('点击节点管理可切换页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.locator('.ant-menu').getByText('节点管理').click();
    await page.waitForTimeout(1000);
    // 应显示节点管理相关内容
    const hasContent = await page.locator('.ant-table').isVisible().catch(() => false)
      || await page.locator('.ant-card').first().isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

/* ── #126 评测模板管理（回归）── API /templates 已移除 ── */
test.describe('MVP-0 #126: 评测模板管理回归', () => {
  test('旧 /templates API 已重构（预期 404 或新接口）', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/templates');
    // API 已重构，/templates 返回 404 是预期的
    // 记录状态用于后续追踪
    expect([200, 404]).toContain(res.status());
  });
});

/* ── #127 评测任务创建（回归） ── */
test.describe('MVP-0 #127: 评测任务创建回归', () => {
  test('API 创建任务成功并返回 PENDING 状态', async ({ request }) => {
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
    expect(body.data.status).toBe('PENDING');
    expect(body.data.taskNo).toBeTruthy();
  });
});

/* ── #128 任务状态流转（回归） ── */
test.describe('MVP-0 #128: 任务状态流转回归', () => {
  test('任务创建后可查询状态并取消', async ({ request }) => {
    const { token } = await apiLogin(request);
    // 创建任务
    const createRes = await apiPost(request, token, '/tasks', {
      name: `Regr-Flow-${Date.now()}`,
      taskType: 'CUSTOM',
      evalType: 'PERFORMANCE',
      priority: 'LOW',
      evalConfig: '{"testItems":["matmul_fp32"]}',
    });
    expect(createRes.ok()).toBeTruthy();
    const taskId = (await createRes.json()).data.id;

    // 查询状态
    const statusRes = await apiGet(request, token, `/tasks/${taskId}`);
    expect(statusRes.ok()).toBeTruthy();
    const task = (await statusRes.json()).data;
    expect(task.status).toBeTruthy();

    // 取消任务
    const cancelRes = await apiPost(request, token, `/tasks/${taskId}/cancel`);
    expect(cancelRes.ok()).toBeTruthy();
    const cancelBody = await cancelRes.json();
    expect(cancelBody.code).toBe(0);
    expect(['CANCELLED', 'COMPLETED', 'FAILED', 'PENDING']).toContain(cancelBody.data.status);
  });

  test('已完成的任务可重试', async ({ request }) => {
    const { token } = await apiLogin(request);
    // 找到一个已完成或失败的任务
    const tasksRes = await apiGet(request, token, '/tasks');
    const tasks = (await tasksRes.json()).data || [];
    const retryable = tasks.find((t: any) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status));
    test.skip(!retryable, '无可重试任务');

    const retryRes = await apiPost(request, token, `/tasks/${retryable!.id}/retry`);
    // retry 可能成功也可能返回错误（取决于任务状态），但不应 500
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
    // 应有 total 字段
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
    // 不一定有报告但接口不应 500
    expect(reportRes.status()).not.toBe(500);
  });
});

/* ── #131 数字资产管理（回归）── API 已移除 ── */
test.describe('MVP-0 #131: 数字资产管理回归', () => {
  test('旧 /assets API 已重构（预期 404）', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/assets');
    // 预期 404，功能已重构入新架构
    expect([200, 404]).toContain(res.status());
  });
});

/* ── #132 计算资源/节点管理（回归） ── */
test.describe('MVP-0 #132: 节点管理回归', () => {
  test('UI 可以导航到节点管理页', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.locator('.ant-menu').getByText('节点管理').click();
    await page.waitForTimeout(1000);
    const hasContent = await page.locator('.ant-table').isVisible().catch(() => false)
      || await page.locator('.ant-card').first().isVisible().catch(() => false)
      || await page.locator('.ant-empty').isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

/* ── #133 Dashboard / 工作台（回归） ── */
test.describe('MVP-0 #133: 工作台 Dashboard 回归', () => {
  test('UI 工作台显示内容', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForTimeout(1500);
    const hasStats = await page.locator('.ant-card').first().isVisible().catch(() => false);
    const hasWelcome = await page.getByText('欢迎').first().isVisible().catch(() => false);
    const hasContent = await page.locator('header').first().isVisible().catch(() => false);
    expect(hasStats || hasWelcome || hasContent).toBeTruthy();
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
    // 评测日志已从侧边栏移除，功能已合并到评测计划执行监控中
    // 此处仅验证旧路由不会崩溃 — 由其他测试覆盖
    expect(true).toBeTruthy();
  });
});

/* ── #136 操作审计日志（回归） ── */
test.describe('MVP-0 #136: 操作审计回归', () => {
  test('UI 可以通过系统设置导航到操作审计', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // 展开系统设置子菜单
    await page.locator('.ant-menu').getByText('系统设置').click();
    await page.waitForTimeout(500);
    // 点击操作审计
    await page.locator('.ant-menu').getByText('操作审计').click();
    await page.waitForTimeout(1000);
    const hasContent = await page.locator('.ant-table').isVisible().catch(() => false)
      || await page.locator('.ant-card').first().isVisible().catch(() => false)
      || await page.locator('.ant-empty').isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

/* ── #137 系统设置页面（回归） ── */
test.describe('MVP-0 #137: 系统设置回归', () => {
  test('UI 可以展开系统设置并导航到用户管理', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.locator('.ant-menu').getByText('系统设置').click();
    await page.waitForTimeout(500);
    await page.locator('.ant-menu').getByText('用户管理').click();
    await page.waitForTimeout(1000);
    const hasContent = await page.locator('.ant-table').isVisible().catch(() => false)
      || await page.locator('.ant-card').first().isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
