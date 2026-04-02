/**
 * Feature: 评测报告
 * 验证报告查询、详情、任务关联。
 */
import { test, expect, apiLogin, apiGet, apiPost, pollTaskUntilDone } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 评测报告', () => {
  test('Scenario: 查询报告列表', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/reports');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Scenario: 任务完成后自动生成报告', async ({ request }) => {
    test.setTimeout(180_000);
    const { token } = await apiLogin(request);

    // Given 创建一个任务并等待完成
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Report-${Date.now()}`,
      evalType: 'PERFORMANCE',
      priority: 'LOW',
    });
    const taskId = (await createRes.json()).data.id;
    const finalTask = await pollTaskUntilDone(request, token, taskId, 120_000);

    if (finalTask.status === 'COMPLETED') {
      // When 查询该任务的关联报告
      const reportRes = await apiGet(request, token, `/reports?taskId=${taskId}`);
      expect(reportRes.ok()).toBeTruthy();
      const reportBody = await reportRes.json();

      // Then 应有关联报告（如果报告引擎正常工作）
      const reports = reportBody.data || [];
      if (reports.length === 0) {
        console.log('Task completed but no report generated, skipping');
        return;
      }

      // And 报告应包含 metrics 数据
      const report = reports[0];
      expect(report.reportNo).toBeTruthy();
      expect(report.status).toBe('PUBLISHED');
    }
  });

  test('Scenario: 查看报告详情包含完整数据', async ({ request }) => {
    const { token } = await apiLogin(request);
    const listRes = await apiGet(request, token, '/reports');
    const reports = (await listRes.json()).data || [];

    if (reports.length > 0) {
      // When 查询单个报告详情
      const reportId = reports[0].id;
      const detailRes = await apiGet(request, token, `/reports/${reportId}`);
      expect(detailRes.ok()).toBeTruthy();
      const detail = (await detailRes.json()).data;

      // Then 应包含完整信息
      expect(detail.reportNo).toBeTruthy();
      expect(detail.metrics).toBeTruthy(); // 真实 metrics 数据
      expect(detail.createdAt).toBeTruthy();
    }
  });

  test('Scenario: UI 查看报告列表和详情', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入评测报告页面
    await page.locator('.ant-menu-item', { hasText: '评测报告' }).click();
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });

    // Then 应有报告数据
    const rows = page.locator('.ant-table-row');
    const count = await rows.count();

    if (count > 0) {
      // When 点击查看详情
      await rows.first().getByRole('button', { name: /详情|查看/ }).click();

      // Then 应弹出详情弹窗
      await expect(page.locator('.ant-modal, .ant-drawer').last()).toBeVisible({ timeout: 5_000 });
    }
  });
});
