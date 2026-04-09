/**
 * Feature: 资源池管理 CRUD + 节点绑定
 * Tests: #250 资源池 NODE_POOL
 *
 * Covers:
 * - API: GET/POST/PUT/DELETE /api/resource-pools
 * - API: POST /api/resource-pools/{id}/nodes (绑定)
 * - API: DELETE /api/resource-pools/{id}/nodes/{nodeId} (解绑)
 * - API: GET /api/resource-pools/{id}/stats
 * - UI: ResourcePoolList.js
 */
import { test, expect, apiLogin, apiGet, apiPost, apiPut, apiDelete } from '../../fixtures/auth.fixture';

test.describe('Feature: 资源池管理 CRUD (#250)', () => {
  let token: string;
  let createdPoolId: number;
  let testNodeId: number;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;

    // 创建测试节点用于后续绑定
    const nodeRes = await apiPost(request, token, '/nodes', {
      name: 'BDD-PoolTestNode',
      ipAddress: '192.168.2.100',
      description: '资源池绑定测试节点',
    });
    if (nodeRes.ok()) {
      const nodeBody = await nodeRes.json();
      testNodeId = nodeBody.data?.id;
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup
    if (createdPoolId) {
      try { await apiDelete(request, token, `/resource-pools/${createdPoolId}`); } catch { /* ignore */ }
    }
    if (testNodeId) {
      try { await apiDelete(request, token, `/nodes/${testNodeId}`); } catch { /* ignore */ }
    }
  });

  test('Scenario: API — 创建资源池', async ({ request }) => {
    // Given 已登录
    // When POST /api/resource-pools 创建资源池
    const res = await apiPost(request, token, '/resource-pools', {
      name: 'BDD-Pool',
      type: 'NODE_POOL',
      description: '测试池 - BDD',
      capacity: '{}',
    });

    // Then 返回 200，资源池创建成功
    expect(res.ok(), `创建资源池应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toBe('BDD-Pool');
    createdPoolId = body.data.id;
  });

  test('Scenario: API — 获取资源池列表', async ({ request }) => {
    // Given 已登录
    // When GET /api/resource-pools
    const res = await apiGet(request, token, '/resource-pools');

    // Then 返回资源池列表
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const pools = Array.isArray(body.data) ? body.data : (body.data?.items || body.data?.list || []);
    expect(pools.length).toBeGreaterThan(0);

    // 包含刚创建的资源池
    if (createdPoolId) {
      const found = pools.find((p: any) => p.id === createdPoolId);
      expect(found, '列表应包含刚创建的资源池').toBeTruthy();
    }
  });

  test('Scenario: API — 更新资源池', async ({ request }) => {
    // Given 已登录且有测试资源池
    test.skip(!createdPoolId, '前置创建资源池未成功');

    // When PUT /api/resource-pools/{id}
    const res = await apiPut(request, token, `/resource-pools/${createdPoolId}`, {
      name: 'BDD-Pool-Updated',
      description: '已更新 - BDD 测试',
    });

    // Then 返回 200，资源池已更新
    expect(res.ok(), `更新资源池应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.name).toBe('BDD-Pool-Updated');
  });

  test('Scenario: API — 绑定节点到资源池', async ({ request }) => {
    // Given 有测试资源池和测试节点
    test.skip(!createdPoolId || !testNodeId, '前置资源池或节点未创建');

    // When POST /api/resource-pools/{poolId}/nodes
    const res = await apiPost(request, token, `/resource-pools/${createdPoolId}/nodes`, {
      nodeId: testNodeId,
    });

    // Then 绑定成功
    expect(res.ok(), `绑定节点应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
  });

  test('Scenario: API — 资源池统计', async ({ request }) => {
    // Given 已登录且有测试资源池（已绑定节点）
    test.skip(!createdPoolId, '前置创建资源池未成功');

    // When GET /api/resource-pools/{id}/stats
    const res = await apiGet(request, token, `/resource-pools/${createdPoolId}/stats`);

    // Then 返回节点数/CPU/内存等汇总
    expect(res.ok(), `资源池统计应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    // 统计数据应包含节点相关信息
    expect(body.data).toBeDefined();
  });

  test('Scenario: API — 解绑节点', async ({ request }) => {
    // Given 有已绑定节点的资源池
    test.skip(!createdPoolId || !testNodeId, '前置资源池或节点未创建');

    // When DELETE /api/resource-pools/{poolId}/nodes/{nodeId}
    const res = await apiDelete(request, token, `/resource-pools/${createdPoolId}/nodes/${testNodeId}`);

    // Then 解绑成功
    expect(res.ok(), `解绑节点应返回 200, got ${res.status()}`).toBeTruthy();
  });

  test('Scenario: API — 删除资源池', async ({ request }) => {
    // Given 已登录且有测试资源池
    test.skip(!createdPoolId, '前置创建资源池未成功');

    // When DELETE /api/resource-pools/{id}
    const res = await apiDelete(request, token, `/resource-pools/${createdPoolId}`);

    // Then 删除成功
    expect(res.ok(), `删除资源池应返回 200, got ${res.status()}`).toBeTruthy();

    // 验证已删除
    const checkRes = await apiGet(request, token, '/resource-pools');
    const checkBody = await checkRes.json();
    const pools = Array.isArray(checkBody.data) ? checkBody.data : (checkBody.data?.items || []);
    const found = pools.find((p: any) => p.id === createdPoolId);
    expect(found, '删除后资源池不应存在').toBeFalsy();
    createdPoolId = 0;
  });
});

test.describe('Feature: 资源池管理 UI (#250)', () => {
  test('Scenario: UI — 资源池页面加载', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 已登录
    // When 导航到资源池管理
    const resourceMenu = page.locator('.ant-menu-submenu', { hasText: '资源管理' });
    await resourceMenu.click();
    await page.locator('.ant-menu-item', { hasText: '资源池' }).click();

    // Then 显示资源池列表
    await expect(page.locator('.ant-table, .ant-card, [class*="pool"], [class*="Pool"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: UI — 资源池页面有创建按钮', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 已登录在资源池页面
    const resourceMenu = page.locator('.ant-menu-submenu', { hasText: '资源管理' });
    await resourceMenu.click();
    await page.locator('.ant-menu-item', { hasText: '资源池' }).click();

    // Then 应有创建资源池的按钮
    await expect(page.getByRole('button', { name: /创建|新增|添加/ })).toBeVisible({ timeout: 10_000 });
  });
});
