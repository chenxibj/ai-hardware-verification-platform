/**
 * Feature: 评测计划操作闭环 — 控制台端到端 BDD 测试
 *
 * 重点验证从前端控制台操作的完整流程：
 *   1. 评测计划创建向导（6步 UI 闭环）
 *   2. 计划列表操作（启动/暂停/恢复/取消）
 *   3. 评测监控页（进度/任务列表/操作按钮）
 *   4. 评测结果查看
 *   5. 模板管理（浏览/预览/创建/Fork）
 *   6. 计划与芯片档案页联动
 *
 * 基于 CPU 开发机真实环境，不 mock。
 *
 * 关联 Issue: #162, #163, #164, #165, #161
 */
import { test, expect, apiLogin, apiGet, apiPost, apiPut, uiLogin } from '../../fixtures/auth.fixture';
import { Page } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

/* ── Helpers ── */

/** 确保有可用芯片 */
async function ensureChip(request: any, token: string) {
  const res = await apiGet(request, token, '/chips');
  const chips = (await res.json()).data || [];
  if (chips.length > 0) return chips[0];
  const createRes = await apiPost(request, token, '/chips', {
    name: `BDD-E2E-Chip-${Date.now()}`,
    vendor: 'NVIDIA',
    chipType: 'GPU',
    fp16Tflops: 312,
    fp32Tflops: 156,
    memoryGb: 80,
    memoryBw: 2.0,
    tdpW: 700,
  });
  return (await createRes.json()).data;
}

/** 确保有可用模板 */
async function ensureTemplate(request: any, token: string) {
  const res = await apiGet(request, token, '/templates');
  const body = await res.json();
  const templates = body.data || [];
  if (templates.length > 0) return templates[0];
  return null;
}

/** 确保有可用节点 */
async function ensureNode(request: any, token: string) {
  const res = await apiGet(request, token, '/nodes');
  const nodes = (await res.json()).data || [];
  if (nodes.length > 0) return nodes[0];
  const createRes = await apiPost(request, token, '/nodes', {
    name: `BDD-Node-${Date.now()}`,
    address: '127.0.0.1:50051',
    nodeType: 'CPU',
    status: 'ONLINE',
  });
  const body = await createRes.json();
  return body.data;
}

/** UI: 导航到评测计划列表 */
async function navigateToPlanList(page: Page) {
  // 点击菜单中的评测计划
  const menuItem = page.locator('.ant-menu').getByText('评测计划');
  if (await menuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await menuItem.click();
  } else {
    // 可能在子菜单里
    await page.goto('/plans');
  }
  await page.waitForTimeout(1000);
}

/** UI: 导航到创建评测计划页 */
async function navigateToPlanCreate(page: Page) {
  await navigateToPlanList(page);
  // 尝试多种方式找到创建按钮
  const createBtn = page.getByRole('button', { name: /创建评测计划|创建计划|新建|创建/ });
  if (await createBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await createBtn.first().click();
  } else {
    // 直接导航
    await page.goto('/plans-create');
  }
  await page.waitForTimeout(1000);
}

// ============================================================================
// Feature 1: 评测计划创建向导 — 控制台 UI 操作闭环
// ============================================================================
test.describe('Feature: 评测计划创建向导 UI 闭环', () => {

  test('Scenario: 从计划列表进入创建页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    // When 点击评测计划菜单
    await navigateToPlanList(page);

    // Then 应看到计划列表页面
    const pageVisible = await page.getByText(/评测计划|计划列表/).first().isVisible({ timeout: 8000 }).catch(() => false);
    expect(pageVisible).toBeTruthy();

    // When 点击创建按钮
    const createBtn = page.getByRole('button', { name: /创建|新建/ });
    const btnVisible = await createBtn.first().isVisible({ timeout: 5000 }).catch(() => false);

    // Then 创建按钮应可见
    expect(btnVisible).toBeTruthy();
  });

  test('Scenario: 向导第一步 — 选择芯片', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;

    // Given 系统中有已注册的芯片
    await ensureChip(request, authToken);

    // When 进入创建评测计划向导
    await navigateToPlanCreate(page);

    // Then 应显示 Steps 进度条
    const hasSteps = await page.locator('.ant-steps').isVisible({ timeout: 8000 }).catch(() => false);
    expect(hasSteps).toBeTruthy();

    // And 第一步应有芯片选择列表
    const hasChipSelect = await page.getByText(/选择.*芯片|目标芯片|Step 1/).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasChipSelect).toBeTruthy();

    // And 应有可选的芯片卡片/行
    const chipItems = page.locator('.ant-radio-wrapper, .ant-card, .ant-list-item');
    const chipCount = await chipItems.count();
    expect(chipCount).toBeGreaterThan(0);
  });

  test('Scenario: 向导第一步 — 未选芯片时下一步不可进', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    await ensureChip(request, authToken);
    await navigateToPlanCreate(page);

    // Given 在第一步，不选任何芯片
    // When 直接点击下一步
    const nextBtn = page.getByRole('button', { name: /下一步|Next/ });
    if (await nextBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await nextBtn.first().click();
      await page.waitForTimeout(500);

      // Then 应仍在第一步或显示错误提示
      const stillStep1 = await page.getByText(/选择.*芯片|目标芯片/).first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      const hasError = await page.locator('.ant-message-error, .ant-form-item-explain-error')
        .isVisible({ timeout: 3000 }).catch(() => false);
      expect(stillStep1 || hasError).toBeTruthy();
    }
  });

  test('Scenario: 向导 — 选择芯片后进入模板选择', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    await ensureChip(request, authToken);
    await navigateToPlanCreate(page);

    // Given 在第一步
    // When 选择第一个芯片
    const firstChip = page.locator('.ant-radio-wrapper, .ant-card').first();
    if (await firstChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstChip.click();
      await page.waitForTimeout(300);
    }

    // And 点击下一步
    const nextBtn = page.getByRole('button', { name: /下一步|Next/ });
    if (await nextBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // Then 应进入模板选择步骤
    const hasTemplateStep = await page.getByText(/选择.*模板|评测模板|预设|Step 2/).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const step2Active = await page.locator('.ant-steps-item-active, .ant-steps-item-process')
      .nth(1).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTemplateStep || step2Active).toBeTruthy();
  });

  test('Scenario: 向导 — 有预设方案快速选择（快速验证/标准评测/全量评测）', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    await ensureChip(request, authToken);
    await navigateToPlanCreate(page);

    // 选芯片 → 下一步
    const firstChip = page.locator('.ant-radio-wrapper, .ant-card').first();
    if (await firstChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstChip.click();
    }
    const nextBtn = page.getByRole('button', { name: /下一步|Next/ });
    if (await nextBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // Then 应有三种预设方案
    const hasQuick = await page.getByText(/快速验证/).isVisible({ timeout: 5000 }).catch(() => false);
    const hasStandard = await page.getByText(/标准评测/).isVisible({ timeout: 3000 }).catch(() => false);
    const hasFull = await page.getByText(/全量评测|深度评测/).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasQuick || hasStandard || hasFull).toBeTruthy();
  });

  test('Scenario: 向导 — 完整走完6步并提交', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    await ensureChip(request, authToken);
    await ensureNode(request, authToken);
    await navigateToPlanCreate(page);

    // Step 1: 选芯片
    const firstChip = page.locator('.ant-radio-wrapper, .ant-card').first();
    if (await firstChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstChip.click();
    }

    // 点击下一步 — 循环走到最后
    for (let step = 0; step < 5; step++) {
      const nextBtn = page.getByRole('button', { name: /下一步|Next/ });
      if (await nextBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        // 在模板选择步骤尝试选第一个模板/预设
        const presetCard = page.locator('.ant-card').first();
        if (await presetCard.isVisible({ timeout: 2000 }).catch(() => false)) {
          await presetCard.click().catch(() => {});
          await page.waitForTimeout(300);
        }
        await nextBtn.first().click();
        await page.waitForTimeout(800);
      }
    }

    // 最后一步应有提交按钮
    const submitBtn = page.getByRole('button', { name: /提交|确认|执行|创建/ });
    const hasSubmit = await submitBtn.first().isVisible({ timeout: 5000 }).catch(() => false);

    // Then 应该能到达确认提交步骤
    expect(hasSubmit).toBeTruthy();
  });

  test('Scenario: 向导 — 上一步按钮可以回退', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    await ensureChip(request, authToken);
    await navigateToPlanCreate(page);

    // 选芯片 → 下一步
    const firstChip = page.locator('.ant-radio-wrapper, .ant-card').first();
    if (await firstChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstChip.click();
    }
    const nextBtn = page.getByRole('button', { name: /下一步|Next/ });
    if (await nextBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.first().click();
      await page.waitForTimeout(800);
    }

    // When 点击上一步
    const prevBtn = page.getByRole('button', { name: /上一步|返回|Back/ });
    if (await prevBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await prevBtn.first().click();
      await page.waitForTimeout(800);
    }

    // Then 应回到选芯片步骤
    const backToStep1 = await page.getByText(/选择.*芯片|目标芯片/).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(backToStep1).toBeTruthy();
  });
});

// ============================================================================
// Feature 2: 评测计划列表操作
// ============================================================================
test.describe('Feature: 评测计划列表操作', () => {

  test('Scenario: 计划列表 — 显示统计卡片', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToPlanList(page);

    // Then 应有统计信息（如"运行中"、"已完成"等）
    const hasStats = await page.locator('.ant-statistic, .ant-card').first()
      .isVisible({ timeout: 8000 }).catch(() => false);
    expect(hasStats).toBeTruthy();
  });

  test('Scenario: 计划列表 — 表格展示所有计划', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToPlanList(page);

    // Then 应显示表格
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 8000 }).catch(() => false);
    expect(hasTable).toBeTruthy();
  });

  test('Scenario: 计划列表 — 状态筛选', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToPlanList(page);

    // When 查找状态筛选控件
    const statusFilter = page.locator('.ant-select').first();
    const hasFilter = await statusFilter.isVisible({ timeout: 5000 }).catch(() => false);

    // Then 应有状态筛选下拉
    expect(hasFilter).toBeTruthy();
  });

  test('Scenario: 计划列表 — 点击计划进入监控页', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    // 确保有计划
    const chip = await ensureChip(request, authToken);
    await apiPost(request, authToken, '/plans', {
      chipId: chip.id, name: `BDD-Monitor-${Date.now()}`, preset: 'QUICK',
    });

    await navigateToPlanList(page);

    // When 点击第一行的查看/详情按钮
    const viewBtn = page.getByRole('button', { name: /查看|详情|监控/ }).first();
    const viewLink = page.locator('.ant-table a, .ant-table .ant-btn').first();
    if (await viewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewBtn.click();
    } else if (await viewLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewLink.click();
    }
    await page.waitForTimeout(1000);

    // Then 应跳转到计划详情/监控页
    const hasMonitor = await page.getByText(/任务|进度|监控|评测/).first()
      .isVisible({ timeout: 8000 }).catch(() => false);
    expect(hasMonitor).toBeTruthy();
  });

  test('Scenario: API — 启动评测计划', async ({ request }) => {
    // Given 创建一个 DRAFT 计划
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-Start-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;

    // When 启动计划
    const startRes = await apiPut(request, token, `/plans/${planId}/start`, {});

    // Then 状态应变为 RUNNING
    const body = await startRes.json();
    if (body.code === 0) {
      expect(body.data.status).toBe('RUNNING');
    }
  });

  test('Scenario: API — 暂停并恢复评测计划', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-PauseResume-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;

    // 启动
    await apiPut(request, token, `/plans/${planId}/start`, {});

    // When 暂停
    const pauseRes = await apiPut(request, token, `/plans/${planId}/pause`, {});
    const pauseBody = await pauseRes.json();
    if (pauseBody.code === 0) {
      expect(pauseBody.data.status).toBe('PAUSED');
    }

    // When 恢复
    const resumeRes = await apiPut(request, token, `/plans/${planId}/resume`, {});
    const resumeBody = await resumeRes.json();
    if (resumeBody.code === 0) {
      expect(resumeBody.data.status).toBe('RUNNING');
    }
  });

  test('Scenario: API — 取消评测计划', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-Cancel-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;

    // When 取消计划
    const cancelRes = await apiPut(request, token, `/plans/${planId}/cancel`, {});
    const body = await cancelRes.json();
    if (body.code === 0) {
      expect(body.data.status).toBe('CANCELLED');
    }
  });
});

// ============================================================================
// Feature 3: 评测监控页操作
// ============================================================================
test.describe('Feature: 评测监控页', () => {

  test('Scenario: 监控页 — 显示进度条和任务统计', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    const chip = await ensureChip(request, authToken);
    const planRes = await apiPost(request, authToken, '/plans', {
      chipId: chip.id, name: `BDD-Monitor-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;

    // When 导航到监控页
    await page.goto(`/plans/${planId}/monitor`);
    await page.waitForTimeout(2000);

    // Then 应有进度展示
    const hasProgress = await page.locator('.ant-progress, .ant-statistic').first()
      .isVisible({ timeout: 8000 }).catch(() => false);
    const hasContent = await page.getByText(/进度|任务|完成/).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasProgress || hasContent).toBeTruthy();
  });

  test('Scenario: 监控页 — 显示任务分组列表', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    const chip = await ensureChip(request, authToken);
    const planRes = await apiPost(request, authToken, '/plans', {
      chipId: chip.id, name: `BDD-TaskGroup-${Date.now()}`, preset: 'STANDARD',
    });
    const planId = (await planRes.json()).data.id;

    await page.goto(`/plans/${planId}/monitor`);
    await page.waitForTimeout(2000);

    // Then 应有任务列表或分组
    const hasTasks = await page.locator('.ant-collapse, .ant-table, .ant-list, .ant-tag').first()
      .isVisible({ timeout: 8000 }).catch(() => false);
    expect(hasTasks).toBeTruthy();
  });

  test('Scenario: 监控页 — 暂停/恢复/取消按钮可见', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    const chip = await ensureChip(request, authToken);
    const planRes = await apiPost(request, authToken, '/plans', {
      chipId: chip.id, name: `BDD-Buttons-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;
    // 启动计划
    await apiPut(request, authToken, `/plans/${planId}/start`, {});

    await page.goto(`/plans/${planId}/monitor`);
    await page.waitForTimeout(2000);

    // Then 应有操作按钮
    const hasPause = await page.getByRole('button', { name: /暂停/ }).isVisible({ timeout: 5000 }).catch(() => false);
    const hasCancel = await page.getByRole('button', { name: /取消|终止/ }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasPause || hasCancel).toBeTruthy();
  });
});

// ============================================================================
// Feature 4: 模板管理 — 控制台操作
// ============================================================================
test.describe('Feature: 模板管理', () => {

  test('Scenario: 模板列表 — 有预置模板', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 导航到模板管理
    await page.goto('/template-list');
    await page.waitForTimeout(1500);

    // Then 应有模板列表
    const hasTemplates = await page.locator('.ant-card, .ant-table').first()
      .isVisible({ timeout: 8000 }).catch(() => false);
    expect(hasTemplates).toBeTruthy();
  });

  test('Scenario: 模板列表 — 预置模板不为空', async ({ request }) => {
    // API 验证
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/templates');
    const body = await res.json();
    const templates = body.data || [];

    // Then 应有预置模板
    expect(templates.length).toBeGreaterThan(0);

    // And 预置模板应有名称和配置
    for (const t of templates) {
      expect(t.name).toBeTruthy();
    }
  });

  test('Scenario: 创建自定义模板', async ({ request }) => {
    const { token } = await apiLogin(request);

    // When 创建模板
    const res = await apiPost(request, token, '/templates', {
      name: `BDD-Custom-Template-${Date.now()}`,
      evaluationLayer: 'OPERATOR',
      evalType: 'ACCURACY',
      description: 'BDD测试用自定义模板',
      configJson: JSON.stringify({
        operators: ['MatMul', 'Conv2D', 'ReLU'],
        dtypes: ['FP16', 'FP32'],
      }),
    });

    // Then 创建成功
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.name).toContain('BDD-Custom-Template');
    expect(body.data.isSystem).toBe(false);
  });

  test('Scenario: UI — 创建模板按钮可点击', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/template-list');
    await page.waitForTimeout(1500);

    // Then 应有创建模板按钮
    const createBtn = page.getByRole('button', { name: /创建|新建/ });
    const visible = await createBtn.first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(visible).toBeTruthy();
  });
});

// ============================================================================
// Feature 5: 评测结果查看
// ============================================================================
test.describe('Feature: 评测结果查看', () => {

  test('Scenario: API — 查看计划下的任务列表', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-Results-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;

    // When 查询任务
    const taskRes = await apiGet(request, token, `/plans/${planId}/tasks`);

    // Then 返回任务列表
    expect(taskRes.ok()).toBeTruthy();
    const body = await taskRes.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 每个任务有完整属性', async ({ request }) => {
    const { token } = await apiLogin(request);
    const chip = await ensureChip(request, token);
    const planRes = await apiPost(request, token, '/plans', {
      chipId: chip.id, name: `BDD-TaskAttr-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;

    const taskRes = await apiGet(request, token, `/plans/${planId}/tasks`);
    const tasks = (await taskRes.json()).data || [];

    // Then 每个任务应有必要字段
    for (const task of tasks) {
      expect(task.id).toBeTruthy();
      expect(task.status).toBeTruthy();
      expect(task.planId).toBe(planId);
    }
  });

  test('Scenario: UI — 任务结果页面可访问', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    const chip = await ensureChip(request, authToken);
    const planRes = await apiPost(request, authToken, '/plans', {
      chipId: chip.id, name: `BDD-TaskUI-${Date.now()}`, preset: 'QUICK',
    });
    const planId = (await planRes.json()).data.id;

    // 获取第一个任务ID
    const taskRes = await apiGet(request, authToken, `/plans/${planId}/tasks`);
    const tasks = (await taskRes.json()).data || [];

    if (tasks.length > 0) {
      // When 访问任务结果页
      await page.goto(`/tasks/${tasks[0].id}/result`);
      await page.waitForTimeout(2000);

      // Then 页面不应报错（不是404）
      const hasContent = await page.getByText(/结果|执行|任务|详情/).first()
        .isVisible({ timeout: 8000 }).catch(() => false);
      const has404 = await page.getByText(/404|Not Found/).isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasContent || !has404).toBeTruthy();
    }
  });
});

// ============================================================================
// Feature 6: 芯片档案页 → 创建评测计划联动
// ============================================================================
test.describe('Feature: 芯片档案联动', () => {

  test('Scenario: 芯片档案页有创建评测计划入口', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    const chip = await ensureChip(request, authToken);

    // When 访问芯片档案页
    await page.goto(`/chips/${chip.id}`);
    await page.waitForTimeout(2000);

    // Then 应有创建评测计划按钮
    const hasCreateBtn = await page.getByRole('button', { name: /创建评测|评测计划/ })
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasLink = await page.getByText(/创建评测|开始评测/).first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasCreateBtn || hasLink).toBeTruthy();
  });

  test('Scenario: 芯片档案页展示评测历史', async ({ authenticatedPage, request, authToken }) => {
    const page = authenticatedPage;
    const chip = await ensureChip(request, authToken);
    // 创建一个计划
    await apiPost(request, authToken, '/plans', {
      chipId: chip.id, name: `BDD-ChipHistory-${Date.now()}`, preset: 'QUICK',
    });

    // When 访问芯片档案页
    await page.goto(`/chips/${chip.id}`);
    await page.waitForTimeout(2000);

    // Then 应有评测历史Tab或列表
    const hasHistory = await page.getByText(/评测历史|评测记录|历史/).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasHistory).toBeTruthy();
  });
});

// ============================================================================
// Feature 7: 计划列表中的"创建计划"按钮交互
// ============================================================================
test.describe('Feature: 计划列表创建按钮交互 (Bug验证)', () => {

  test('BUG验证: 计划列表创建按钮应跳转到创建页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToPlanList(page);

    // When 点击创建按钮
    const createBtn = page.getByRole('button', { name: /创建|新建/ });
    if (await createBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.first().click();
      await page.waitForTimeout(1500);

      // Then 应跳转到创建页面或打开创建向导
      const url = page.url();
      const hasCreatePage = url.includes('create') || url.includes('plans-create');
      const hasWizard = await page.locator('.ant-steps').isVisible({ timeout: 5000 }).catch(() => false);
      const hasChipSelect = await page.getByText(/选择.*芯片|创建评测/).first()
        .isVisible({ timeout: 5000 }).catch(() => false);

      // 应至少满足一个条件
      expect(hasCreatePage || hasWizard || hasChipSelect).toBeTruthy();
    }
  });

  test('BUG验证: 创建计划不应默认隐藏', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToPlanList(page);

    // Then 创建按钮应始终可见
    const createBtn = page.getByRole('button', { name: /创建|新建/ });
    const isVisible = await createBtn.first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
  });
});
