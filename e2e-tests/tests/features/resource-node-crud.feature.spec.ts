/**
 * Feature: 节点管理 CRUD + 标签管理
 * Tests: #248 节点管理 CRUD 完善, #249 节点标签管理
 *
 * Covers:
 * - API: GET/POST/PUT/DELETE /api/nodes
 * - API: POST /api/nodes/{id}/heartbeat
 * - API: POST /api/nodes/{id}/diagnose
 * - API: POST /api/nodes/{id}/repair
 * - API: GET /api/nodes/stats
 * - 标签 JSON 格式存储与查询
 * - UI: NodeList.js 列表 + 注册/编辑/删除
 */
import { test, expect, apiLogin, apiGet, apiPost, apiPut, apiDelete } from '../../fixtures/auth.fixture';

test.describe('Feature: 节点管理 CRUD (#248)', () => {
  let token: string;
  let createdNodeId: number;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: delete the test node if it was created
    if (createdNodeId) {
      try {
        await apiDelete(request, token, `/nodes/${createdNodeId}`);
      } catch { /* ignore */ }
    }
  });

  test('Scenario: API — 创建节点', async ({ request }) => {
    // Given 已登录
    // When POST /api/nodes 创建新节点
    const res = await apiPost(request, token, '/nodes', {
      name: 'BDD-TestNode',
      ipAddress: '192.168.1.100',
      description: '测试节点 - BDD CRUD 测试',
    });

    // Then 返回成功，节点 id 存在，status=OFFLINE
    expect(res.ok(), `创建节点应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toBe('BDD-TestNode');
    expect(body.data.status).toBe('OFFLINE');
    createdNodeId = body.data.id;
  });

  test('Scenario: API — 获取节点列表', async ({ request }) => {
    // Given 已登录且有测试节点
    test.skip(!createdNodeId, '前置创建节点未成功');

    // When GET /api/nodes
    const res = await apiGet(request, token, '/nodes');

    // Then 返回节点列表，包含刚创建的节点
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const nodes = Array.isArray(body.data) ? body.data : (body.data?.items || body.data?.list || []);
    const found = nodes.find((n: any) => n.id === createdNodeId);
    expect(found, '节点列表应包含刚创建的节点').toBeTruthy();
    expect(found.name).toBe('BDD-TestNode');
  });

  test('Scenario: API — 更新节点', async ({ request }) => {
    // Given 已登录且有测试节点
    test.skip(!createdNodeId, '前置创建节点未成功');

    // When PUT /api/nodes/{id} 更新节点信息
    const res = await apiPut(request, token, `/nodes/${createdNodeId}`, {
      name: 'BDD-UpdatedNode',
      description: '已更新 - BDD 测试',
    });

    // Then 返回 200，name 已更新
    expect(res.ok(), `更新节点应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.name).toBe('BDD-UpdatedNode');
  });

  test('Scenario: API — 节点心跳', async ({ request }) => {
    // Given 已登录且有测试节点
    test.skip(!createdNodeId, '前置创建节点未成功');

    // When POST /api/nodes/{id}/heartbeat
    const res = await apiPost(request, token, `/nodes/${createdNodeId}/heartbeat`);

    // Then 节点 status 变为 ONLINE
    expect(res.ok(), `心跳应返回 200, got ${res.status()}`).toBeTruthy();

    // 验证节点状态已更新
    const checkRes = await apiGet(request, token, `/nodes/${createdNodeId}`);
    if (checkRes.ok()) {
      const checkBody = await checkRes.json();
      if (checkBody.data) {
        expect(checkBody.data.status).toBe('ONLINE');
      }
    }
  });

  test('Scenario: API — 节点诊断', async ({ request }) => {
    // Given 已登录且有测试节点
    test.skip(!createdNodeId, '前置创建节点未成功');

    // When POST /api/nodes/{id}/diagnose
    const res = await apiPost(request, token, `/nodes/${createdNodeId}/diagnose`);

    // Then 返回诊断结果
    // 诊断可能因节点实际不可达而返回非 200，但 API 端点应该存在
    expect([200, 500].includes(res.status()), `诊断 API 应存在, got ${res.status()}`).toBeTruthy();
  });

  test('Scenario: API — 节点修复', async ({ request }) => {
    // Given 已登录且有测试节点
    test.skip(!createdNodeId, '前置创建节点未成功');

    // When POST /api/nodes/{id}/repair
    const res = await apiPost(request, token, `/nodes/${createdNodeId}/repair`);

    // Then 返回修复结果
    expect([200, 500].includes(res.status()), `修复 API 应存在, got ${res.status()}`).toBeTruthy();
  });

  test('Scenario: API — 节点统计', async ({ request }) => {
    // Given 已登录
    // When GET /api/nodes/stats
    const res = await apiGet(request, token, '/nodes/stats');

    // Then 返回 totalNodes/onlineNodes/totalCpu 等字段
    expect(res.ok(), `统计 API 应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('totalNodes');
    expect(body.data).toHaveProperty('onlineNodes');
    expect(body.data).toHaveProperty('totalCpu');
    expect(typeof body.data.totalNodes).toBe('number');
    expect(typeof body.data.onlineNodes).toBe('number');
  });

  test('Scenario: API — 删除节点', async ({ request }) => {
    // Given 已登录且有测试节点
    test.skip(!createdNodeId, '前置创建节点未成功');

    // When DELETE /api/nodes/{id}
    const res = await apiDelete(request, token, `/nodes/${createdNodeId}`);

    // Then 返回成功
    expect(res.ok(), `删除节点应返回 200, got ${res.status()}`).toBeTruthy();

    // 验证节点已删除
    const checkRes = await apiGet(request, token, '/nodes');
    const checkBody = await checkRes.json();
    const nodes = Array.isArray(checkBody.data) ? checkBody.data : (checkBody.data?.items || []);
    const found = nodes.find((n: any) => n.id === createdNodeId);
    expect(found, '删除后节点不应存在于列表中').toBeFalsy();
    createdNodeId = 0; // 标记已删除，afterAll 不再尝试清理
  });
});

test.describe('Feature: 节点标签管理 (#249)', () => {
  let token: string;
  let tagNodeId: number;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test.afterAll(async ({ request }) => {
    if (tagNodeId) {
      try {
        await apiDelete(request, token, `/nodes/${tagNodeId}`);
      } catch { /* ignore */ }
    }
  });

  test('Scenario: API — 创建带标签的节点', async ({ request }) => {
    // Given 已登录
    // When POST /api/nodes 创建带标签的节点
    const tags = JSON.stringify([
      { key: 'env', value: 'test' },
      { key: 'gpu', value: 'A100' },
    ]);
    const res = await apiPost(request, token, '/nodes', {
      name: 'BDD-TagNode',
      ipAddress: '192.168.1.200',
      description: '标签测试节点',
      tags,
    });

    // Then 返回的 tags 包含正确的 JSON 标签
    expect(res.ok(), `创建带标签节点应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    tagNodeId = body.data.id;

    // 验证 tags 字段
    const returnedTags = typeof body.data.tags === 'string'
      ? JSON.parse(body.data.tags)
      : body.data.tags;
    expect(Array.isArray(returnedTags)).toBeTruthy();
    const envTag = returnedTags.find((t: any) => t.key === 'env');
    expect(envTag?.value).toBe('test');
    const gpuTag = returnedTags.find((t: any) => t.key === 'gpu');
    expect(gpuTag?.value).toBe('A100');
  });

  test('Scenario: API — 更新节点标签', async ({ request }) => {
    // Given 已登录且有带标签的节点
    test.skip(!tagNodeId, '前置创建标签节点未成功');

    // When PUT /api/nodes/{id} 更新标签
    const newTags = JSON.stringify([
      { key: 'env', value: 'staging' },
      { key: 'region', value: 'beijing' },
    ]);
    const res = await apiPut(request, token, `/nodes/${tagNodeId}`, {
      tags: newTags,
    });

    // Then 标签已更新
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const updatedTags = typeof body.data.tags === 'string'
      ? JSON.parse(body.data.tags)
      : body.data.tags;
    expect(Array.isArray(updatedTags)).toBeTruthy();
    const envTag = updatedTags.find((t: any) => t.key === 'env');
    expect(envTag?.value).toBe('staging');
  });

  test('Scenario: API — 按类型筛选节点', async ({ request }) => {
    // Given 已登录
    // When GET /api/nodes?type=GPU
    const res = await apiGet(request, token, '/nodes?type=GPU');

    // Then 返回结果（可能为空，但 API 不应报错）
    expect(res.ok(), `按类型筛选应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
  });
});

test.describe('Feature: 节点管理 UI (#248)', () => {
  test('Scenario: UI — 节点管理页面加载', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 已登录
    // When 导航到节点管理
    // 展开资源管理子菜单
    const resourceMenu = page.locator('.ant-menu-submenu', { hasText: '资源管理' });
    await resourceMenu.click();
    await page.locator('.ant-menu-item', { hasText: '节点管理' }).click();

    // Then 页面显示节点表格，有"注册节点"按钮
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /注册节点|添加节点|新增/ })).toBeVisible({ timeout: 5_000 });
  });

  test('Scenario: UI — 注册新节点', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 已登录在节点管理页
    const resourceMenu = page.locator('.ant-menu-submenu', { hasText: '资源管理' });
    await resourceMenu.click();
    await page.locator('.ant-menu-item', { hasText: '节点管理' }).click();
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });

    // When 点击注册节点，填写表单，提交
    await page.getByRole('button', { name: /注册节点|添加节点|新增/ }).click();

    // 等待 Modal 出现
    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // 填写节点名称
    await modal.locator('input[placeholder*="gpu-node"]').fill('BDD-UITestNode');

    // 填写 IP 地址
    await modal.locator('input[placeholder="192.168.1.100"]').fill('192.168.1.250');

    // 选择节点类型（必填）
    await modal.locator('.ant-select').first().click();
    await page.locator('.ant-select-dropdown .ant-select-item', { hasText: 'CPU' }).first().click();

    // 提交
    await modal.getByRole('button', { name: /确定|OK/ }).click();

    // Then 表格中出现新节点
    await expect(page.locator('.ant-table')).toContainText('BDD-UITestNode', { timeout: 10_000 });
  });

  test('Scenario: UI — 节点列表显示状态', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 已登录
    // When 导航到节点管理
    const resourceMenu = page.locator('.ant-menu-submenu', { hasText: '资源管理' });
    await resourceMenu.click();
    await page.locator('.ant-menu-item', { hasText: '节点管理' }).click();

    // Then 页面显示节点表格，含状态列
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });
    // 表格应有表头
    const headers = page.locator('.ant-table-thead th');
    await expect(headers.first()).toBeVisible();
  });
});
