/**
 * US-1.5: 计算节点选择与资源分配
 * 
 * 用户故事: 作为评测工程师，我需要选择合适的计算节点并配置资源分配策略
 * 
 * 验收标准:
 * - 节点列表显示状态(在线/离线/忙碌)
 * - 离线节点不可选
 * - 支持5种资源模式: exclusive/shared/gpu_exclusive/multi_gpu/multi_node
 * - 节点匹配检测
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('US-1.5: 计算节点选择与资源分配', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: API — 获取可用计算节点列表', async ({ request }) => {
    // Given 用户已登录
    // When 查询节点列表
    const res = await apiGet(request, token, '/nodes');
    // Then 返回节点列表
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
  });

  test('Scenario: API — 节点有状态字段(online/offline)', async ({ request }) => {
    const res = await apiGet(request, token, '/nodes');
    const body = await res.json();
    const nodes = body.data?.items || body.data?.list || body.data || [];
    if (nodes.length > 0) {
      // Then 每个节点有状态
      expect(nodes[0]).toHaveProperty('status');
    }
  });

  test('Scenario: UI — 节点管理页面显示节点列表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Given 导航到节点管理
    await page.goto('/nodes');
    await page.waitForTimeout(2000);
    // Then 页面加载成功
    const content = page.locator('.ant-table, [class*="node"], [class*="resource"]');
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });
});
