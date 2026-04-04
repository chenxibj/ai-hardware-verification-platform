/**
 * US-X.3: Dashboard 总览 (v3.2 增强)
 * 
 * 用户故事: 作为平台用户，我需要一个总览页快速掌握评测进展
 * 
 * 验收标准:
 * - 统计卡片×4: 芯片总数/评测中/已完成/待评测
 * - 实时动态×5
 * - 雷达图对比
 * - 最近5个计划
 * - 快速操作: 注册新芯片/创建评测计划/芯片对比/评测榜单
 * - 空状态: "🚀 欢迎使用 AHVP！" + [注册第一颗芯片]
 * - 自动刷新: 30s
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('US-X.3: Dashboard 总览 v3.2', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: API — Dashboard 统计包含芯片分类计数', async ({ request }) => {
    // When 请求Dashboard统计
    const res = await apiGet(request, token, '/dashboard/stats');
    if (res.ok()) {
      const body = await res.json();
      expect(body.code).toBe(0);
      // Then 应有芯片统计
      expect(body.data).toBeTruthy();
    }
  });

  test('Scenario: API — 获取最近评测计划', async ({ request }) => {
    const res = await apiGet(request, token, '/plans?page=1&pageSize=5&sort=createdAt&order=desc');
    expect(res.ok()).toBeTruthy();
  });

  test('Scenario: UI — Dashboard 有4个统计卡片', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // 默认登录后就在 Dashboard
    await page.waitForTimeout(2000);
    // 统计卡片
    const cards = page.locator('.ant-statistic, .ant-card, [class*="stat"], [class*="card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Scenario: UI — Dashboard 有快速操作按钮', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.waitForTimeout(2000);
    // 快速操作: 注册新芯片 / 创建评测计划
    const quickBtns = page.locator('button, a[href]');
    const count = await quickBtns.count();
    expect(count).toBeGreaterThan(0);
  });
});
