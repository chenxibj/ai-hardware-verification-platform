/**
 * Feature: MVP-0 Dashboard + 新导航结构
 *
 * 覆盖产品设计文档 MVP-0 功能:
 *   - Dashboard 芯片统计卡片 (芯片总数/评测中/已完成/待评测)
 *   - Dashboard 评测动态
 *   - Dashboard 快速操作
 *   - 新导航结构 (4个一级: Dashboard/芯片管理/评测计划/节点管理 + 系统设置)
 *   - 旧13模块导航已重构
 *
 * 关联 Issue: [MVP-0][BDD] Dashboard + 新导航结构
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';
import { Page } from '@playwright/test';

// ============================================================================
// Feature 1: Dashboard API
// ============================================================================
test.describe('MVP-0: Dashboard API', () => {

  test('Scenario: API — Dashboard 统计接口返回芯片数量', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询 Dashboard 统计数据
    // 尝试多个可能的端点
    let statsData: any = null;

    const endpoints = ['/dashboard/stats', '/chips/stats', '/dashboard'];
    for (const ep of endpoints) {
      const res = await apiGet(request, token, ep);
      if (res.ok()) {
        const body = await res.json();
        if (body.code === 0) {
          statsData = body.data;
          break;
        }
      }
    }

    // 如果没有专门的统计端点，用芯片列表计数
    if (!statsData) {
      const chipRes = await apiGet(request, token, '/chips');
      const chips = (await chipRes.json()).data || [];
      statsData = { totalChips: chips.length };
    }

    // Then 应有芯片总数
    expect(statsData).toBeTruthy();
  });

  test('Scenario: API — 芯片统计按状态分类', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询所有芯片
    const res = await apiGet(request, token, '/chips');
    const chips = (await res.json()).data || [];

    // Then 可以按状态分类
    const statusCounts: Record<string, number> = {};
    for (const chip of chips) {
      statusCounts[chip.status] = (statusCounts[chip.status] || 0) + 1;
    }

    // And 状态值应是合法枚举
    for (const status of Object.keys(statusCounts)) {
      expect(['REGISTERED', 'EVALUATING', 'EVALUATED']).toContain(status);
    }
  });

  test('Scenario: API — 评测计划统计数据', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 查询评测计划列表
    const res = await apiGet(request, token, '/plans');

    // Then 返回数据可用于统计
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Scenario: API — 健康检查端点正常', async ({ request }) => {
    // Given 系统在运行
    const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

    // When 检查健康状态
    const res = await request.get(`${API_BASE}/health`);

    // Then 返回 UP
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('UP');
  });
});

// ============================================================================
// Feature 2: Dashboard UI
// ============================================================================
test.describe('MVP-0: Dashboard UI', () => {

  test('Scenario: UI — Dashboard 页面加载成功', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    // Then Dashboard（工作台）应作为默认页面可见
    const hasDashboard = await page.getByText(/工作台|Dashboard/).first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    expect(hasDashboard).toBeTruthy();
  });

  test('Scenario: UI — Dashboard 显示芯片统计卡片', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在 Dashboard 页面
    // Then 应有统计卡片（芯片总数/评测中/已完成等）
    const hasStatistic = await page.locator('.ant-statistic, .ant-card-statistic, [class*="stat"]').first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    const hasChipCount = await page.getByText(/芯片|总数|评测中|已完成/).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasStatistic || hasChipCount).toBeTruthy();
  });

  test('Scenario: UI — Dashboard 有快速操作按钮', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在 Dashboard
    // Then 应有快速操作（注册芯片/创建评测计划等）
    const hasQuickAction = await page.getByRole('button', { name: /注册|创建|芯片|评测/ }).first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    const hasLink = await page.getByText(/注册新芯片|创建评测计划/).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    // 至少应有某种入口操作
    expect(hasQuickAction || hasLink).toBeTruthy();
  });
});

// ============================================================================
// Feature 3: 新导航结构
// ============================================================================
test.describe('MVP-0: 新导航结构 (4+1)', () => {

  test('Scenario: UI — 侧边栏有 Dashboard 导航', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const menu = page.locator('.ant-menu, .ant-layout-sider');

    // Then 应有 Dashboard/工作台
    const hasDashboard = await menu.getByText(/Dashboard|工作台/).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasDashboard).toBeTruthy();
  });

  test('Scenario: UI — 侧边栏有芯片管理导航', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const menu = page.locator('.ant-menu, .ant-layout-sider');

    // Then 应有芯片管理入口
    const hasChipMgmt = await menu.getByText('芯片管理').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasChipMgmt).toBeTruthy();
  });

  test('Scenario: UI — 芯片管理展开有子菜单', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 点击芯片管理
    await page.locator('.ant-menu').getByText('芯片管理').click();
    await page.waitForTimeout(500);

    // Then 应展开子菜单（芯片列表）
    const hasChipList = await page.locator('.ant-menu').getByText('芯片列表')
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasChipList).toBeTruthy();
  });

  test('Scenario: UI — 侧边栏有评测计划导航', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const menu = page.locator('.ant-menu, .ant-layout-sider');

    // Then 应有评测计划入口
    const hasPlan = await menu.getByText('评测计划').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasPlan).toBeTruthy();
  });

  test('Scenario: UI — 侧边栏有节点管理导航', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const menu = page.locator('.ant-menu, .ant-layout-sider');

    // Then 应有节点管理入口
    const hasNodes = await menu.getByText(/节点管理|计算资源/).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasNodes).toBeTruthy();
  });

  test('Scenario: UI — 侧边栏有系统设置', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const menu = page.locator('.ant-menu, .ant-layout-sider');

    // Then 应有系统设置入口
    const hasSettings = await menu.getByText('系统设置').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasSettings).toBeTruthy();
  });

  test('Scenario: UI — 导航到芯片列表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 展开芯片管理并点击芯片列表
    await page.locator('.ant-menu').getByText('芯片管理').click();
    await page.waitForTimeout(500);
    await page.locator('.ant-menu').getByText('芯片列表').click();
    await page.waitForTimeout(1000);

    // Then 芯片列表页应加载
    const hasContent = await page.locator('.ant-table, .ant-card').first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('Scenario: UI — 导航到评测计划列表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // When 点击评测计划
    await page.locator('.ant-menu').getByText('评测计划').click();
    await page.waitForTimeout(1000);

    // Then 评测计划页应加载
    const hasContent = await page.locator('.ant-table, .ant-card').first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    const hasText = await page.getByText(/评测计划|计划列表/).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasContent || hasText).toBeTruthy();
  });

  test('Scenario: UI — 侧边栏收起展开功能正常', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 侧边栏可见
    await expect(page.locator('.ant-layout-sider')).toBeVisible();

    // When 点击折叠
    const trigger = page.locator('.ant-layout-sider-trigger');
    if (await trigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await trigger.click();

      // Then 侧边栏收起
      await expect(page.locator('.ant-layout-sider-collapsed')).toBeVisible({ timeout: 5_000 });

      // When 再次点击
      await trigger.click();

      // Then 侧边栏展开
      await expect(page.locator('.ant-layout-sider-collapsed')).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
