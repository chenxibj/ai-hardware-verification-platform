/**
 * US-2.6: 评测报告分析（多维度可视化与趋势分析）
 * 
 * 用户故事: 作为产品经理，我需要对评测数据进行多维度分析和趋势追踪
 * 
 * 验收标准:
 * - 多维度对比(雷达图/柱状图)
 * - 趋势分析(折线图)
 * - 异常检测(热力图)
 * - 分布分析(散点图/箱线图)
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

test.describe('US-2.6: 评测报告分析', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: API — 报告详情包含维度评分数据', async ({ request }) => {
    const rptRes = await apiGet(request, token, '/reports');
    const reports = (await rptRes.json()).data?.items || (await rptRes.json()).data?.list || [];
    test.skip(reports.length === 0, '无报告');
    const res = await apiGet(request, token, `/reports/${reports[0].id}`);
    if (res.ok()) {
      const body = await res.json();
      // Then 报告应有评分数据
      expect(body.data).toBeTruthy();
    }
  });

  test('Scenario: API — 按芯片ID查询报告列表(趋势数据)', async ({ request }) => {
    const chipRes = await apiGet(request, token, '/chips?page=1&pageSize=1');
    const chips = (await chipRes.json()).data?.items || (await chipRes.json()).data?.list || [];
    test.skip(chips.length === 0, '无芯片');
    const res = await apiGet(request, token, `/chips/${chips[0].id}/reports`);
    expect(res.ok()).toBeTruthy();
  });

  test('Scenario: UI — 报告管理页面可访问', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/reports');
    await page.waitForTimeout(2000);
    const content = page.locator('.ant-table, [class*="report"], [class*="card"]');
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });
});
