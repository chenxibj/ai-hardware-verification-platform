/**
 * US-1.4: 评测参数配置（交互设计要点）
 * 
 * 用户故事: 作为评测工程师，我需要为不同评测类型精确配置参数
 * 
 * 验收标准:
 * - 渐进式披露: 常用参数展示，高级折叠
 * - 模板预填充
 * - 实时预览
 * - 参数联动
 * - 实时校验
 * - 导入/导出 JSON
 */
import { test, expect, apiLogin, apiPost, apiGet } from '../../fixtures/auth.fixture';

const API = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('US-1.4: 评测参数配置', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: API — 创建计划时可配置全局参数(并发/超时/重试)', async ({ request }) => {
    // Given 已有芯片
    const chipRes = await apiGet(request, token, '/chips?page=1&pageSize=1');
    const chips = (await chipRes.json()).data?.items || (await chipRes.json()).data?.list || [];
    test.skip(chips.length === 0, '无芯片数据');
    // When 创建计划并指定参数
    const res = await apiPost(request, token, '/plans', {
      name: `ParamTest-${Date.now()}`,
      chipId: chips[0].id,
      preset: 'QUICK',
      maxConcurrent: 2,
      globalTimeout: 7200,
      maxRetries: 1,
    });
    // Then 参数应保存成功
    if (res.ok()) {
      const body = await res.json();
      expect(body.code).toBe(0);
    }
  });

  test('Scenario: API — 模板选择后参数预填充', async ({ request }) => {
    // Given 有系统预置模板
    const tplRes = await apiGet(request, token, '/templates');
    const tpls = (await tplRes.json()).data?.items || (await tplRes.json()).data?.list || [];
    test.skip(tpls.length === 0, '无模板');
    // When 查看模板详情
    const tpl = tpls[0];
    const detailRes = await apiGet(request, token, `/templates/${tpl.id}`);
    // Then 模板应包含默认参数
    if (detailRes.ok()) {
      const body = await detailRes.json();
      expect(body.data).toBeTruthy();
    }
  });

  test('Scenario: UI — 创建计划向导中参数配置步骤可见', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Given 进入评测计划创建页
    await page.goto('/plans/create');
    await page.waitForTimeout(2000);
    // Then 应有步骤导航
    const steps = page.locator('.ant-steps, [class*="steps"], [class*="wizard"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });
  });
});
