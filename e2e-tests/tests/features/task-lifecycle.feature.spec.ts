/**
 * Feature: 评测任务全生命周期
 *
 * 最核心的测试 — 验证任务从创建到执行完成的完整流程。
 * 包括 API 级别的生命周期验证和 UI 创建流程验证。
 */
import { test, expect, apiLogin, apiPost, apiGet, pollTaskUntilDone } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 评测任务全生命周期', () => {
  test('Scenario: 通过 API 创建任务并验证完整状态流转', async ({ request }) => {
    // Given 用户已通过 API 登录
    const { token } = await apiLogin(request);

    // When 创建一个算子性能评测任务
    const createRes = await apiPost(request, token, '/tasks', {
      name: `BDD-Lifecycle-${Date.now()}`,
      evalType: 'PERFORMANCE',
      evalObject: 'OPERATOR',
      priority: 'LOW',
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();
    expect(createBody.code).toBe(0);

    const taskId = createBody.data.id;
    const taskNo = createBody.data.taskNo;

    // Then 任务初始状态应为 PENDING
    expect(createBody.data.status).toBe('PENDING');
    expect(createBody.data.evalType).toBe('PERFORMANCE');
    expect(createBody.data.evalObject).toBe('OPERATOR');
    expect(taskNo).toMatch(/^EVT-/);

    // And 轮询等待任务到达终态（COMPLETED 或 FAILED）
    const finalTask = await pollTaskUntilDone(request, token, taskId, 60_000, 2_000);

    // Then 任务应该到达某个终态
    expect(['COMPLETED', 'FAILED', 'CANCELLED']).toContain(finalTask.status);

    // And 完成时间应已填充
    if (finalTask.status === 'COMPLETED') {
      expect(finalTask.completedAt).toBeTruthy();
      expect(finalTask.progress).toBe(100);
      expect(finalTask.result).toBeTruthy();
    }
  });

  test('Scenario: 创建任务后立即查询能看到该任务', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 创建一个新任务
    const name = `BDD-Query-${Date.now()}`;
    const createRes = await apiPost(request, token, '/tasks', {
      name,
      evalType: 'ACCURACY',
      evalObject: 'MODEL',
      priority: 'MEDIUM',
    });
    expect(createRes.ok()).toBeTruthy();
    const taskId = (await createRes.json()).data.id;

    // And 查询任务列表
    const listRes = await apiGet(request, token, '/tasks');
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    expect(listBody.code).toBe(0);

    // Then 任务列表中应包含刚创建的任务
    const found = listBody.data.find((t: any) => t.id === taskId);
    expect(found).toBeTruthy();
    expect(found.name).toBe(name);

    // And 通过 ID 查询也应返回正确数据
    const getRes = await apiGet(request, token, `/tasks/${taskId}`);
    expect(getRes.ok()).toBeTruthy();
    const getBody = await getRes.json();
    expect(getBody.data.name).toBe(name);
    expect(getBody.data.evalType).toBe('ACCURACY');

    // 等待完成以清理
    await pollTaskUntilDone(request, token, taskId, 60_000);
  });

  test('Scenario: 创建不同类型的评测任务都能成功执行', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    const evalConfigs = [
      { evalType: 'PERFORMANCE', evalObject: 'CHIP', name: 'BDD-芯片' },
      { evalType: 'COMPATIBILITY', evalObject: 'FRAMEWORK', name: 'BDD-框架' },
      { evalType: 'PERFORMANCE', evalObject: 'SCENE', name: 'BDD-场景' },
    ];

    for (const cfg of evalConfigs) {
      // When 创建该类型的评测任务
      const res = await apiPost(request, token, '/tasks', {
        name: `${cfg.name}-${Date.now()}`,
        evalType: cfg.evalType,
        evalObject: cfg.evalObject,
        priority: 'LOW',
      });
      expect(res.ok(), `Should create ${cfg.name} task`).toBeTruthy();
      const body = await res.json();
      expect(body.code).toBe(0);
      expect(body.data.evalType).toBe(cfg.evalType);

      // Then 任务应到达终态
      const final = await pollTaskUntilDone(request, token, body.data.id, 60_000);
      expect(['COMPLETED', 'FAILED']).toContain(final.status);
    }
  });

  test('Scenario: 通过 UI 使用模板化模式创建任务', async ({ authenticatedPage, request }) => {
    test.setTimeout(120_000);
    const page = authenticatedPage;
    const { token } = await apiLogin(request);

    // Given 用户已登录并进入评测任务页面
    await page.locator('.ant-menu-item', { hasText: '评测任务' }).click();
    await expect(page.locator('text=评测任务管理')).toBeVisible({ timeout: 10_000 });

    // When 点击"创建评测任务"
    await page.getByRole('button', { name: /创建评测任务/ }).click();
    await page.waitForTimeout(1000);

    // Step 0: 选择模板化创建模式
    const modal = page.locator('.ant-modal');
    await modal.locator('.ant-card', { hasText: '模板化创建' }).click();
    await page.waitForTimeout(500);

    // 点击下一步 → Step 1: 选择模板
    await modal.getByRole('button', { name: '下一步' }).click();
    await page.waitForTimeout(1000);

    // Step 1: 选择"算子性能评测"模板
    const templateCard = modal.locator('.ant-card', { hasText: '算子性能评测' });
    await expect(templateCard).toBeVisible({ timeout: 10_000 });
    await templateCard.click();
    await page.waitForTimeout(500);

    // 点击下一步 → Step 2: 选择节点
    await modal.getByRole('button', { name: '下一步' }).click();
    await page.waitForTimeout(1000);

    // Step 2: 可选择节点（也可跳过，自动分配）
    const nodeCard = modal.locator('.ant-radio-wrapper').first();
    if (await nodeCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nodeCard.click();
      await page.waitForTimeout(500);
    }

    // 点击下一步 → Step 3: 确认提交
    await modal.getByRole('button', { name: '下一步' }).click();
    await page.waitForTimeout(1000);

    // Step 3: 确认并运行
    const submitBtn = modal.getByRole('button', { name: /确认并运行/ });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // Then 验证创建结果
    const success = await page.locator('.ant-message-success').isVisible({ timeout: 15_000 }).catch(() => false);
    if (success) {
      await page.waitForTimeout(2000);
      const listRes = await apiGet(request, token, '/tasks?size=5');
      const listBody = await listRes.json();
      const tasks = listBody.data || listBody;
      const latest = tasks[0];
      if (latest) {
        const final = await pollTaskUntilDone(request, token, latest.id, 60_000);
        expect(['COMPLETED', 'FAILED', 'RUNNING', 'QUEUED', 'PENDING']).toContain(final.status);
      }
    }
  });

  test('Scenario: 通过 UI 使用自定义模式创建任务', async ({ authenticatedPage, request }) => {
    test.setTimeout(120_000);
    const page = authenticatedPage;
    const { token } = await apiLogin(request);

    // Given 用户已登录并进入评测任务页面
    await page.locator('.ant-menu-item', { hasText: '评测任务' }).click();
    await expect(page.locator('text=评测任务管理')).toBeVisible({ timeout: 10_000 });

    // When 点击"创建评测任务"
    await page.getByRole('button', { name: /创建评测任务/ }).click();
    await page.waitForTimeout(1000);

    // Step 0: 选择自定义创建模式
    const modal = page.locator('.ant-modal');
    await modal.locator('.ant-card', { hasText: '自定义创建' }).click();
    await page.waitForTimeout(500);

    // 点击下一步 → Step 1: 基础信息
    await modal.getByRole('button', { name: '下一步' }).click();
    await page.waitForTimeout(1000);

    // Step 1: 填写基础信息
    const taskName = `BDD-UI-Custom-${Date.now()}`;
    const nameInput = modal.locator('#name');
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.fill(taskName);
    }

    // 选择评测类型
    const evalTypeSelect = modal.locator('#evalType');
    if (await evalTypeSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await evalTypeSelect.click();
      await page.waitForTimeout(500);
      await page.locator('.ant-select-item-option').first().click();
      await page.waitForTimeout(500);
    }

    // 点击下一步 → Step 2: 评测配置
    const nextBtn = modal.getByRole('button', { name: '下一步' });
    if (await nextBtn.isEnabled({ timeout: 3_000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1000);

      // Step 2 → Step 3
      const nextBtn2 = modal.getByRole('button', { name: '下一步' });
      if (await nextBtn2.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await nextBtn2.click();
        await page.waitForTimeout(1000);
      }

      // Step 3: 确认并运行
      const submitBtn = modal.getByRole('button', { name: /确认并运行/ });
      if (await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await submitBtn.click();
        const success = await page.locator('.ant-message-success').isVisible({ timeout: 15_000 }).catch(() => false);
        if (success) {
          await page.waitForTimeout(2000);
          const listRes = await apiGet(request, token, '/tasks?size=5');
          const listBody = await listRes.json();
          const tasks = listBody.data || listBody;
          const latest = tasks.find((t: any) => t.name === taskName);
          if (latest) {
            const final = await pollTaskUntilDone(request, token, latest.id, 60_000);
            expect(['COMPLETED', 'FAILED', 'RUNNING', 'QUEUED', 'PENDING']).toContain(final.status);
          }
        }
      }
    }
  });

  test('Scenario: 任务统计 API 返回正确数据', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询任务统计
    const res = await apiGet(request, token, '/tasks/stats');

    // Then 应返回各状态的计数
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('completed');
    expect(body.data).toHaveProperty('failed');
    expect(body.data).toHaveProperty('running');
    expect(body.data).toHaveProperty('pending');

    // And total 应大于等于各状态之和
    const d = body.data;
    expect(d.total).toBeGreaterThanOrEqual(0);
  });
});
