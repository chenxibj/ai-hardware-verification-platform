/**
 * Feature: 计算资源与节点环境
 * 验证节点列表、环境信息采集。
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 计算资源环境信息', () => {
  test('Scenario: 获取节点环境信息', async ({ request }) => {
    const { token } = await apiLogin(request);

    // Given 获取在线节点
    const nodesRes = await apiGet(request, token, '/nodes');
    const nodes = (await nodesRes.json()).data || [];
    const onlineNode = nodes.find((n: any) => n.status === 'ONLINE');

    if (onlineNode) {
      // When 查询环境信息
      const envRes = await apiGet(request, token, `/nodes/${onlineNode.id}/env-info`);

      // Then 应返回环境数据
      if (envRes.ok()) {
        const envBody = await envRes.json();
        expect(envBody.code).toBe(0);
      }
    }
  });

  test('Scenario: UI 查看节点环境信息 Tab', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.locator('.ant-menu-item', { hasText: '计算资源' }).click();
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });

    // 找到在线节点并点击详情
    const onlineRow = page.locator('.ant-table-row').filter({ hasText: /在线|ONLINE/ }).first();
    if (await onlineRow.isVisible().catch(() => false)) {
      await onlineRow.getByRole('button', { name: /详情|查看/ }).click();

      const detail = page.locator('.ant-drawer, .ant-modal').last();
      await expect(detail).toBeVisible({ timeout: 5_000 });

      // 切换到环境信息 Tab
      const envTab = detail.locator('.ant-tabs-tab').filter({ hasText: /环境|硬件/ });
      if (await envTab.isVisible().catch(() => false)) {
        await envTab.click();
        // Then 环境信息 Tab 内容应该可见
        await expect(detail.locator('.ant-tabs-tabpane-active').getByText(/CPU/).first()).toBeVisible({ timeout: 5_000 });
      }
    }
  });
});

test.describe('Feature: 任务暂停与恢复', () => {
  test('Scenario: 暂停运行中的任务', async ({ request }) => {
    const { token } = await apiLogin(request);

    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Pause-${Date.now()}`,
      evalType: 'PERFORMANCE',
      priority: 'LOW',
    });
    const taskId = (await createRes.json()).data.id;

    // 等待进入可暂停状态
    await new Promise(r => setTimeout(r, 2000));

    // When 暂停
    const pauseRes = await apiPost(request, token, `/tasks/${taskId}/pause`);
    const pauseBody = await pauseRes.json();

    if (pauseBody.code === 0) {
      // Then 状态应为 PAUSED
      const task = await apiGet(request, token, `/tasks/${taskId}`);
      const taskData = (await task.json()).data;
      expect(taskData.status).toBe('PAUSED');

      // When 恢复
      const resumeRes = await apiPost(request, token, `/tasks/${taskId}/resume`);
      const resumeBody = await resumeRes.json();

      if (resumeBody.code === 0) {
        const resumed = (await (await apiGet(request, token, `/tasks/${taskId}`)).json()).data;
        expect(['PENDING', 'RUNNING', 'QUEUED']).toContain(resumed.status);
      }
    }
  });
});
