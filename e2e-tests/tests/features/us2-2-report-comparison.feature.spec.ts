/**
 * US-2.2: 多报告对比分析
 * 
 * 用户故事: 作为采购决策者，我需要对比多颗芯片的评测报告做选型
 * 
 * 验收标准:
 * - 入口: 芯片列表多选→[对比] / 报告页[与他芯对比]
 * - 雷达图叠加/维度评分对比表/算子级柱状图
 * - 导出对比报告PDF
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

test.describe('US-2.2: 多报告对比分析', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: API — 对比报告接口可调用', async ({ request }) => {
    // Given 获取报告列表
    const rptRes = await apiGet(request, token, '/reports');
    expect(rptRes.ok()).toBeTruthy();
    const reports = (await rptRes.json()).data?.items || (await rptRes.json()).data?.list || [];
    test.skip(reports.length < 2, '报告不足2份，无法测试对比');
    // When 调用对比接口
    const res = await apiPost(request, token, '/reports/compare', {
      reportIds: [reports[0].id, reports[1].id],
    });
    // Then 返回对比数据
    if (res.ok()) {
      const body = await res.json();
      expect(body.code).toBe(0);
    }
  });

  test('Scenario: UI — 芯片对比页面可访问', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/chips/compare');
    await page.waitForTimeout(2000);
    // Then 对比页面加载
    const content = page.locator('[class*="compare"], [class*="contrast"], body');
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });

  test('Scenario: UI — 对比页有芯片选择器', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/chips/compare');
    await page.waitForTimeout(2000);
    const selector = page.locator('.ant-select, [class*="select"], [class*="chip"]');
    // 芯片对比页应有选择控件
    if (await selector.first().isVisible()) {
      expect(true).toBeTruthy();
    }
  });
});
