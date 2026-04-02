/**
 * Feature: 计算资源与节点环境
 * 验证节点列表、环境信息采集、UI 展示。
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('Feature: 计算资源环境信息', () => {
  test('Scenario: 获取节点环境信息', async ({ request }) => {
    // Given 用户已登录并获取在线节点
    const { token } = await apiLogin(request);
    const nodesRes = await apiGet(request, token, '/nodes');
    const nodes = (await nodesRes.json()).data || [];
    const onlineNode = nodes.find((n: any) => n.status === 'ONLINE');

    // 如果没有在线节点，跳过而非静默通过
    test.skip(!onlineNode, '没有在线节点，跳过环境信息测试');

    // When 查询该节点的环境信息
    const envRes = await apiGet(request, token, `/nodes/${onlineNode!.id}/env-info`);

    // Then 应返回环境数据
    expect(envRes.ok()).toBeTruthy();
    const envBody = await envRes.json();
    expect(envBody.code).toBe(0);
  });

  test('Scenario: UI 查看计算资源页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    // When 导航到计算资源页面
    await page.locator('.ant-menu-item', { hasText: '计算资源' }).click();

    // Then 应显示节点表格
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });
  });
});
