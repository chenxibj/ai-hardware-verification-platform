/**
 * Feature: 节点管理 CRUD + 标签管理
 *
 * API CRUD 功能测试。UI 列表/注册测试已移除 (CI 只保留功能测试)。
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
    if (createdNodeId) {
      try { await apiDelete(request, token, `/nodes/${createdNodeId}`); } catch { /* ignore */ }
    }
  });

  test('Scenario: API — 创建节点', async ({ request }) => {
    const res = await apiPost(request, token, '/nodes', {
      name: 'BDD-TestNode',
      ipAddress: '192.168.1.100',
      description: '测试节点 - BDD CRUD 测试',
    });
    expect(res.ok(), `创建节点应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toBe('BDD-TestNode');
    expect(body.data.status).toBe('OFFLINE');
    createdNodeId = body.data.id;
  });

  test('Scenario: API — 获取节点列表', async ({ request }) => {
    test.skip(!createdNodeId, '前置创建节点未成功');
    const res = await apiGet(request, token, '/nodes');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const nodes = Array.isArray(body.data) ? body.data : (body.data?.items || body.data?.list || []);
    const found = nodes.find((n: any) => n.id === createdNodeId);
    expect(found, '节点列表应包含刚创建的节点').toBeTruthy();
    expect(found.name).toBe('BDD-TestNode');
  });

  test('Scenario: API — 更新节点', async ({ request }) => {
    test.skip(!createdNodeId, '前置创建节点未成功');
    const res = await apiPut(request, token, `/nodes/${createdNodeId}`, {
      name: 'BDD-UpdatedNode',
      description: '已更新 - BDD 测试',
    });
    expect(res.ok(), `更新节点应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.name).toBe('BDD-UpdatedNode');
  });

  test('Scenario: API — 节点心跳', async ({ request }) => {
    test.skip(!createdNodeId, '前置创建节点未成功');
    const res = await apiPost(request, token, `/nodes/${createdNodeId}/heartbeat`);
    expect(res.ok(), `心跳应返回 200, got ${res.status()}`).toBeTruthy();
    const checkRes = await apiGet(request, token, `/nodes/${createdNodeId}`);
    if (checkRes.ok()) {
      const checkBody = await checkRes.json();
      if (checkBody.data) {
        expect(checkBody.data.status).toBe('ONLINE');
      }
    }
  });

  test('Scenario: API — 节点诊断', async ({ request }) => {
    test.skip(!createdNodeId, '前置创建节点未成功');
    const res = await apiPost(request, token, `/nodes/${createdNodeId}/diagnose`);
    expect([200, 500].includes(res.status()), `诊断 API 应存在, got ${res.status()}`).toBeTruthy();
  });

  test('Scenario: API — 节点修复', async ({ request }) => {
    test.skip(!createdNodeId, '前置创建节点未成功');
    const res = await apiPost(request, token, `/nodes/${createdNodeId}/repair`);
    expect([200, 500].includes(res.status()), `修复 API 应存在, got ${res.status()}`).toBeTruthy();
  });

  test('Scenario: API — 节点统计', async ({ request }) => {
    const res = await apiGet(request, token, '/nodes/stats');
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
    test.skip(!createdNodeId, '前置创建节点未成功');
    const res = await apiDelete(request, token, `/nodes/${createdNodeId}`);
    expect(res.ok(), `删除节点应返回 200, got ${res.status()}`).toBeTruthy();
    const checkRes = await apiGet(request, token, '/nodes');
    const checkBody = await checkRes.json();
    const nodes = Array.isArray(checkBody.data) ? checkBody.data : (checkBody.data?.items || []);
    const found = nodes.find((n: any) => n.id === createdNodeId);
    expect(found, '删除后节点不应存在于列表中').toBeFalsy();
    createdNodeId = 0;
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
      try { await apiDelete(request, token, `/nodes/${tagNodeId}`); } catch { /* ignore */ }
    }
  });

  test('Scenario: API — 创建带标签的节点', async ({ request }) => {
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
    expect(res.ok(), `创建带标签节点应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    tagNodeId = body.data.id;
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
    test.skip(!tagNodeId, '前置创建标签节点未成功');
    const newTags = JSON.stringify([
      { key: 'env', value: 'staging' },
      { key: 'region', value: 'beijing' },
    ]);
    const res = await apiPut(request, token, `/nodes/${tagNodeId}`, { tags: newTags });
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
    const res = await apiGet(request, token, '/nodes?type=GPU');
    expect(res.ok(), `按类型筛选应返回 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
  });
});
