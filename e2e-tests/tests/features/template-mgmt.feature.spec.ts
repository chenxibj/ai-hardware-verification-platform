/**
 * Feature: 模板管理
 *
 * API CRUD 功能测试。UI 卡片/按钮测试已移除 (CI 只保留功能测试)。
 */
import { test, expect, apiLogin, apiPost, apiGet, apiDelete } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 评测模板管理 API', () => {
  test('Scenario: 查询系统预置模板列表', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/templates');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const templates = body.data;
    expect(templates.length).toBeGreaterThan(0);
    const systemTemplates = templates.filter((t: any) => t.isSystem);
    expect(systemTemplates.length).toBeGreaterThan(0);
  });

  test('Scenario: 通过 API 创建自定义模板', async ({ request }) => {
    const { token } = await apiLogin(request);
    const templateName = `BDD-Template-${Date.now()}`;
    const res = await apiPost(request, token, '/templates', {
      name: templateName,
      description: 'BDD 测试创建的模板',
      evalType: 'PERFORMANCE',
      configJson: JSON.stringify({ evalDimension: 'OPERATOR', iterations: 100 }),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const template = body.data;
    expect(template.name).toBe(templateName);
    expect(template.evalType).toBe('PERFORMANCE');
    expect(template.isSystem).toBe(false);
    expect(template.id).toBeGreaterThan(0);
    await apiDelete(request, token, `/templates/${template.id}`);
  });

  test('Scenario: 删除自定义模板', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/templates', {
      name: `BDD-Delete-${Date.now()}`,
      description: 'Will be deleted',
      evalType: 'GENERAL',
      configJson: '{}',
    });
    const templateId = (await createRes.json()).data.id;
    const deleteRes = await apiDelete(request, token, `/templates/${templateId}`);
    expect(deleteRes.ok()).toBeTruthy();
    const deleteBody = await deleteRes.json();
    expect(deleteBody.code).toBe(0);
    const listRes = await apiGet(request, token, '/templates');
    const templates = (await listRes.json()).data;
    const found = templates.find((t: any) => t.id === templateId);
    expect(found).toBeUndefined();
  });

  test('Scenario: 克隆模板（通过 POST 创建副本）', async ({ request }) => {
    const { token } = await apiLogin(request);
    const listRes = await apiGet(request, token, '/templates');
    const templates = (await listRes.json()).data;
    const systemTemplate = templates.find((t: any) => t.isSystem);
    expect(systemTemplate).toBeTruthy();
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
    expect(cloneBody.data.isSystem).toBe(false);
    expect(cloneBody.data.name).toBe(cloneName);
    await apiDelete(request, token, `/templates/${cloneBody.data.id}`);
  });

  test('Scenario: PUT 更新模板（如后端支持则验证更新生效）', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/templates', {
      name: `BDD-Put-${Date.now()}`,
      description: 'Test PUT support',
      evalType: 'PERFORMANCE',
      configJson: '{}',
    });
    const templateId = (await createRes.json()).data.id;
    const putRes = await request.put(`${API_BASE}/templates/${templateId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'Updated', description: 'updated', evalType: 'ACCURACY', configJson: '{}' },
    });
    // Backend may or may not support PUT
    if (putRes.ok()) {
      const body = await putRes.json();
      expect(body.code).toBe(0);
      expect(body.data.name).toBe('Updated');
    } else {
      // PUT not supported — that's also acceptable
      expect([401, 405]).toContain(putRes.status());
    }
    await apiDelete(request, token, `/templates/${templateId}`);
  });

  test('Scenario: 系统模板不可删除', async ({ request }) => {
    const { token } = await apiLogin(request);
    const listRes = await apiGet(request, token, '/templates');
    const templates = (await listRes.json()).data;
    const systemTemplate = templates.find((t: any) => t.isSystem);
    expect(systemTemplate).toBeTruthy();
    const deleteRes = await apiDelete(request, token, `/templates/${systemTemplate.id}`);
    const body = await deleteRes.json();
    expect(body.code).not.toBe(0);
  });
});
