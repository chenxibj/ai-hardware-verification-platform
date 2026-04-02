/**
 * Feature: 模板管理
 *
 * 验证评测模板的 CRUD 操作（通过 API 和 UI）。
 * 注意：后端仅支持 GET/POST /templates 和 GET/DELETE /templates/{id}，
 *       不支持 PUT/PATCH /templates/{id}。
 */
import { test, expect, apiLogin, apiPost, apiGet, apiDelete } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 评测模板管理', () => {
  test('Scenario: 查询系统预置模板列表', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询模板列表
    const res = await apiGet(request, token, '/templates');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // Then 应包含系统预置模板
    const templates = body.data;
    expect(templates.length).toBeGreaterThan(0);

    // And 系统模板应标记为 isSystem=true
    const systemTemplates = templates.filter((t: any) => t.isSystem);
    expect(systemTemplates.length).toBeGreaterThan(0);
  });

  test('Scenario: 通过 API 创建自定义模板', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);
    const templateName = `BDD-Template-${Date.now()}`;

    // When 创建一个自定义模板
    const res = await apiPost(request, token, '/templates', {
      name: templateName,
      description: 'BDD 测试创建的模板',
      evalType: 'PERFORMANCE',
      configJson: JSON.stringify({ evalDimension: 'OPERATOR', iterations: 100 }),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // Then 模板应创建成功
    const template = body.data;
    expect(template.name).toBe(templateName);
    expect(template.evalType).toBe('PERFORMANCE');
    expect(template.isSystem).toBe(false);
    expect(template.id).toBeGreaterThan(0);

    // Cleanup: 删除创建的模板
    await apiDelete(request, token, `/templates/${template.id}`);
  });

  test('Scenario: 删除自定义模板', async ({ request }) => {
    // Given 用户已登录并创建了一个模板
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/templates', {
      name: `BDD-Delete-${Date.now()}`,
      description: 'Will be deleted',
      evalType: 'GENERAL',
      configJson: '{}',
    });
    const templateId = (await createRes.json()).data.id;

    // When 删除模板
    const deleteRes = await apiDelete(request, token, `/templates/${templateId}`);
    expect(deleteRes.ok()).toBeTruthy();
    const deleteBody = await deleteRes.json();
    expect(deleteBody.code).toBe(0);

    // Then 模板列表中不应再包含该模板
    const listRes = await apiGet(request, token, '/templates');
    const templates = (await listRes.json()).data;
    const found = templates.find((t: any) => t.id === templateId);
    expect(found).toBeUndefined();
  });

  test('Scenario: 克隆模板（通过 POST 创建副本）', async ({ request }) => {
    // Given 用户已登录，存在系统模板
    const { token } = await apiLogin(request);
    const listRes = await apiGet(request, token, '/templates');
    const templates = (await listRes.json()).data;
    const systemTemplate = templates.find((t: any) => t.isSystem);
    expect(systemTemplate).toBeTruthy();

    // When 克隆该系统模板（POST /templates with similar data + "副本" suffix）
    const cloneName = `${systemTemplate.name} (BDD副本)`;
    const cloneRes = await apiPost(request, token, '/templates', {
      name: cloneName,
      description: systemTemplate.description,
      evalType: systemTemplate.evalType,
      configJson: systemTemplate.configJson,
    });
    expect(cloneRes.ok()).toBeTruthy();
    const cloneBody = await cloneRes.json();
    expect(cloneBody.code).toBe(0);

    // Then 克隆的模板不应标记为系统模板
    expect(cloneBody.data.isSystem).toBe(false);
    expect(cloneBody.data.name).toBe(cloneName);

    // Cleanup
    await apiDelete(request, token, `/templates/${cloneBody.data.id}`);
  });

  test('Scenario: 后端不支持 PUT 更新模板（验证限制）', async ({ request }) => {
    // Given 用户已登录并创建了模板
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/templates', {
      name: `BDD-NoPut-${Date.now()}`,
      description: 'Test PUT not supported',
      evalType: 'PERFORMANCE',
      configJson: '{}',
    });
    const templateId = (await createRes.json()).data.id;

    // When 尝试 PUT 更新模板
    const putRes = await request.put(`${API_BASE}/templates/${templateId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'Updated', description: 'updated', evalType: 'ACCURACY', configJson: '{}' },
    });

    // Then PUT 应该返回 401（后端不支持此方法）
    // Note: 后端对 /templates/{id} 仅支持 GET 和 DELETE
    expect(putRes.status()).toBe(401);

    // Cleanup
    await apiDelete(request, token, `/templates/${templateId}`);
  });

  test('Scenario: UI 上查看系统预置模板卡片', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    // When 导航到模板管理页面
    await page.locator('.ant-menu-item', { hasText: '评测模板' }).click();
    await expect(page.locator('text=评测模板管理')).toBeVisible({ timeout: 10_000 });

    // Then 应该显示系统预置模板卡片
    await expect(page.locator('.ant-card', { hasText: '📦 系统' }).first()).toBeVisible({ timeout: 10_000 });

    // And 应该有模板表格
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: UI 创建自定义模板', async ({ authenticatedPage, request }) => {
    const page = authenticatedPage;
    const { token } = await apiLogin(request);

    // Given 用户已登录并在模板管理页面
    await page.locator('.ant-menu-item', { hasText: '评测模板' }).click();
    await expect(page.locator('text=评测模板管理')).toBeVisible({ timeout: 10_000 });

    // When 点击新建模板按钮
    await page.getByRole('button', { name: /新建模板/ }).click();
    await page.waitForTimeout(500);

    // And 填写模板信息
    const tmplName = `BDD-UI-Tmpl-${Date.now()}`;
    await page.locator('.ant-modal').locator('#name').fill(tmplName);
    await page.locator('.ant-modal').locator('#description').fill('BDD UI created template');

    // 选择评测类型
    await page.locator('.ant-modal').locator('#evalType').click();
    await page.locator('.ant-select-item-option', { hasText: '性能评测' }).click();

    // And 提交
    await page.locator('.ant-modal').getByRole('button', { name: /创.*建/ }).click();

    // Then 应显示创建成功
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 10_000 });

    // Cleanup: 删除刚创建的模板
    await page.waitForTimeout(1000);
    const listRes = await apiGet(request, token, '/templates');
    const templates = (await listRes.json()).data;
    const created = templates.find((t: any) => t.name === tmplName);
    if (created) {
      await apiDelete(request, token, `/templates/${created.id}`);
    }
  });
});
