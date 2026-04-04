/**
 * US-1.9: 自主编排系统（拖拽式评测流程设计）
 * 
 * 用户故事: 作为高级评测工程师，我需要通过可视化拖拽界面自定义评测流程
 * 
 * 状态: Phase 2，标记 fixme
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

test.describe('US-1.9: 自主编排系统 (Phase 2)', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test.fixme('Scenario: API — 获取编排流程列表', async ({ request }) => {
    // Given 用户已登录
    // When 查询编排流程
    const res = await apiGet(request, token, '/workflows');
    // Then 返回流程列表
    expect(res.ok()).toBeTruthy();
  });

  test.fixme('Scenario: API — 创建编排流程', async ({ request }) => {
    // Given 用户准备了流程配置
    // When 创建新流程
    const res = await apiPost(request, token, '/workflows', {
      name: `OrcTest-${Date.now()}`,
      nodes: [
        { type: 'data_load', name: '加载数据' },
        { type: 'inference', name: '推理执行' },
        { type: 'accuracy', name: '精度计算' },
      ],
      edges: [
        { from: '加载数据', to: '推理执行' },
        { from: '推理执行', to: '精度计算' },
      ],
    });
    // Then 流程创建成功
    expect(res.ok()).toBeTruthy();
  });

  test.fixme('Scenario: API — 校验流程（循环依赖检测）', async ({ request }) => {
    // When 提交有循环依赖的流程
    const res = await apiPost(request, token, '/workflows/validate', {
      nodes: [
        { id: 'A', type: 'inference' },
        { id: 'B', type: 'accuracy' },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' },
      ],
    });
    // Then 返回循环依赖错误
    expect(res.ok()).toBeFalsy();
  });

  test.fixme('Scenario: UI — 编排页面有画布和节点面板', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/workflows');
    await page.waitForTimeout(2000);
    // Then 应有流程编排界面
    const canvas = page.locator('[class*="canvas"], [class*="flow"], [class*="workflow"]');
    await expect(canvas.first()).toBeVisible({ timeout: 10000 });
  });
});
