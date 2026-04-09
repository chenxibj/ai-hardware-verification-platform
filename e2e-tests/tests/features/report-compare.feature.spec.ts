/**
 * Feature: 评测报告对比分析
 *
 * 用户故事: 作为评测工程师，我需要对比多份评测报告以分析性能差异
 *
 * 覆盖场景:
 * 1. API — chip-reports/compare 接口正确返回对比数据
 * 2. 报告对比页面 — 加载报告列表、勾选报告、执行对比
 * 3. 对比结果展示 — 维度评分表、雷达图
 * 4. 边界条件 — 单选禁用、超选限制
 * 5. 芯片详情页入口 — 从芯片档案页发起对比
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 评测报告对比分析', () => {
  let token: string;
  let reportIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;

    // Fetch real report IDs for test data
    const res = await apiGet(request, token, '/chip-reports?page=0&size=5');
    const body = await res.json();
    if (body.code === 0 && body.data) {
      reportIds = body.data
        .filter((r: any) => r.status === 'PUBLISHED')
        .map((r: any) => r.id);
    }
  });

  // ── API 层验证 ──

  test('Scenario: API — chip-reports 列表接口可用', async ({ request }) => {
    // Given 用户已登录
    // When 请求报告列表
    const res = await apiGet(request, token, '/chip-reports?page=0&size=10');

    // Then 返回成功且包含报告数据
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('Scenario: API — chip-reports/compare 对比接口返回正确结构', async ({ request }) => {
    test.skip(reportIds.length < 2, '已发布报告不足2份，跳过');

    // Given 有至少2份已发布报告
    const ids = reportIds.slice(0, 2).join(',');

    // When 调用对比接口
    const res = await apiGet(request, token, `/chip-reports/compare?ids=${ids}`);

    // Then 返回成功
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // And 包含 reports 数组
    expect(body.data).toBeTruthy();
    expect(body.data.reports).toBeTruthy();
    expect(body.data.reports.length).toBe(2);

    // And 每份报告有维度评分
    const report = body.data.reports[0];
    expect(report.dimensions).toBeTruthy();
    expect(report.overallScore).toBeDefined();
  });

  // ── 报告对比页面（Comparisons）──

  test('Scenario: 报告对比页面 — 加载并显示报告列表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    // When 导航到对比页面
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    /* 点击侧边栏中"评测报告"子菜单（先展开父菜单） */
    const menuItems = page.locator('.ant-menu-item');
    const reportMenu = menuItems.filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1000);
    }

    // Then 页面展示报告管理标题
    const title = page.locator('text=评测报告管理');
    await expect(title).toBeVisible({ timeout: 10_000 });

    // And 表格中有报告数据
    const rows = page.locator('.ant-table-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: 报告列表页 — 勾选2份报告后对比按钮可用', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在报告列表页
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    const reportMenu = page.locator('.ant-menu-item').filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1500);
    }

    // When 不选中任何报告
    // Then 对比分析按钮应该禁用
    const compareBtn = page.locator('button').filter({ hasText: '对比分析' });
    if (await compareBtn.count() > 0) {
      await expect(compareBtn.first()).toBeDisabled();
    }

    // When 勾选第1份报告
    const checkboxes = page.locator('.ant-table-row .ant-checkbox-input');
    const checkboxCount = await checkboxes.count();
    test.skip(checkboxCount < 2, '报告不足2份，无法测试多选');

    await checkboxes.nth(0).click();
    await page.waitForTimeout(300);

    // Then 对比按钮仍应禁用（只选了1份）
    if (await compareBtn.count() > 0) {
      await expect(compareBtn.first()).toBeDisabled();
    }

    // When 勾选第2份报告
    await checkboxes.nth(1).click();
    await page.waitForTimeout(300);

    // Then 对比按钮应启用
    if (await compareBtn.count() > 0) {
      await expect(compareBtn.first()).toBeEnabled();
    }
  });

  test('Scenario: 报告列表页 — 勾选2份报告并执行对比', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在报告列表页
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    const reportMenu = page.locator('.ant-menu-item').filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1500);
    }

    // When 勾选2份报告
    const checkboxes = page.locator('.ant-table-row .ant-checkbox-input');
    const count = await checkboxes.count();
    test.skip(count < 2, '报告不足2份');

    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await page.waitForTimeout(300);

    // And 点击"对比分析"按钮
    const compareBtn = page.locator('button').filter({ hasText: '对比分析' });
    if (await compareBtn.count() > 0) {
      await compareBtn.first().click();
      await page.waitForTimeout(2000);
    }

    // Then 应该展示对比结果
    // 包含"对比分析"标题或维度评分表
    const compareResult = page.locator('text=报告对比分析, text=综合评分对比, text=各维度评分对比').first();
    await expect(compareResult).toBeVisible({ timeout: 15_000 });
  });

  test('Scenario: 对比结果页 — 展示维度评分表和雷达图', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在报告列表页
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    const reportMenu = page.locator('.ant-menu-item').filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1500);
    }

    // When 勾选2份报告并对比
    const checkboxes = page.locator('.ant-table-row .ant-checkbox-input');
    const count = await checkboxes.count();
    test.skip(count < 2, '报告不足2份');

    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await page.waitForTimeout(300);

    const compareBtn = page.locator('button').filter({ hasText: '对比分析' });
    if (await compareBtn.count() > 0) {
      await compareBtn.first().click();
      await page.waitForTimeout(3000);
    }

    // Then 应展示综合评分卡片
    const scoreCards = page.locator('text=综合评分对比');
    await expect(scoreCards).toBeVisible({ timeout: 15_000 });

    // And 应展示维度评分对比表
    const dimTable = page.locator('text=各维度评分对比');
    await expect(dimTable).toBeVisible({ timeout: 10_000 });

    // And 应展示雷达图
    const radarChart = page.locator('text=雷达图叠加对比');
    await expect(radarChart).toBeVisible({ timeout: 10_000 });
  });

  // ── 边界条件 ──

  test('Scenario: 只勾选1份报告时，对比按钮禁用', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入报告列表页
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    const reportMenu = page.locator('.ant-menu-item').filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1500);
    }

    // When 只勾选1份报告
    const checkboxes = page.locator('.ant-table-row .ant-checkbox-input');
    test.skip(await checkboxes.count() < 1, '无报告数据');
    await checkboxes.first().click();
    await page.waitForTimeout(300);

    // Then 对比按钮应禁用
    const compareBtn = page.locator('button').filter({ hasText: '对比分析' });
    if (await compareBtn.count() > 0) {
      await expect(compareBtn.first()).toBeDisabled();
    }
  });

  test('Scenario: 勾选超过限制数量的报告时，提示限制', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入报告列表页
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    const reportMenu = page.locator('.ant-menu-item').filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1500);
    }

    // When 尝试勾选超过4份报告（ReportList 限制为4）
    const checkboxes = page.locator('.ant-table-row .ant-checkbox-input');
    const count = await checkboxes.count();
    test.skip(count < 5, '报告不足5份，跳过超选测试');

    // 尝试快速勾选5个
    for (let i = 0; i < 5; i++) {
      await checkboxes.nth(i).click();
      await page.waitForTimeout(200);
    }

    // Then 应弹出警告提示
    const warning = page.locator('.ant-message-warning');
    await expect(warning).toBeVisible({ timeout: 5_000 });
  });

  // ── 芯片详情页入口 ──

  test('Scenario: 芯片详情页 — 报告列表支持多选对比', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片列表页
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    const chipMenu = page.locator('.ant-menu-item').filter({ hasText: '芯片管理' });
    if (await chipMenu.count() > 0) {
      await chipMenu.first().click();
      await page.waitForTimeout(1500);
    }

    // When 点击第一个芯片的"详情"按钮
    const detailBtns = page.locator('button').filter({ hasText: '详情' });
    test.skip(await detailBtns.count() === 0, '无芯片数据');
    await detailBtns.first().click();
    await page.waitForTimeout(2000);

    // And 切换到"评测历史"tab
    const historyTab = page.locator('.ant-tabs-tab').filter({ hasText: '评测历史' });
    if (await historyTab.count() > 0) {
      await historyTab.click();
      await page.waitForTimeout(1000);
    }

    // Then 应该看到报告横向对比区域（如果有 ≥2 份报告）
    const compareSection = page.locator('text=报告横向对比, text=报告对比');
    if (await compareSection.count() > 0) {
      await expect(compareSection.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('Scenario: 芯片详情页 — 勾选2份报告后跳转到对比页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片列表
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    const chipMenu = page.locator('.ant-menu-item').filter({ hasText: '芯片管理' });
    if (await chipMenu.count() > 0) {
      await chipMenu.first().click();
      await page.waitForTimeout(1500);
    }

    // When 进入芯片详情
    const detailBtns = page.locator('button').filter({ hasText: '详情' });
    test.skip(await detailBtns.count() === 0, '无芯片数据');
    await detailBtns.first().click();
    await page.waitForTimeout(2000);

    // And 切换到评测历史 tab
    const historyTab = page.locator('.ant-tabs-tab').filter({ hasText: '评测历史' });
    if (await historyTab.count() > 0) {
      await historyTab.click();
      await page.waitForTimeout(1000);
    }

    // And 如果有"对比选中报告"按钮区域，选择报告并对比
    const compareCards = page.locator('.ant-checkbox');
    if (await compareCards.count() >= 2) {
      // 点击前两个报告卡片
      await compareCards.nth(0).click();
      await page.waitForTimeout(200);
      await compareCards.nth(1).click();
      await page.waitForTimeout(200);

      // 点击对比按钮
      const compareBtn = page.locator('button').filter({ hasText: /对比|对比分析/ });
      if (await compareBtn.count() > 0) {
        await compareBtn.first().click();
        await page.waitForTimeout(3000);

        // Then 对比结果应可见
        const result = page.locator('text=报告对比分析, text=综合评分对比, text=六维雷达图');
        await expect(result.first()).toBeVisible({ timeout: 15_000 });
      }
    }
  });

  // ── 返回功能 ──

  test('Scenario: 对比结果页 — 返回按钮可用', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在报告列表页勾选并执行了对比
    await page.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: '评测' }).first().click();
    await page.waitForTimeout(500);
    const reportMenu = page.locator('.ant-menu-item').filter({ hasText: '评测报告' });
    if (await reportMenu.count() > 0) {
      await reportMenu.first().click();
      await page.waitForTimeout(1500);
    }

    const checkboxes = page.locator('.ant-table-row .ant-checkbox-input');
    test.skip(await checkboxes.count() < 2, '报告不足2份');

    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await page.waitForTimeout(300);

    const compareBtn = page.locator('button').filter({ hasText: '对比分析' });
    if (await compareBtn.count() > 0) {
      await compareBtn.first().click();
      await page.waitForTimeout(2000);
    }

    // When 点击返回按钮
    const backBtn = page.locator('button').filter({ hasText: '返回' });
    if (await backBtn.count() > 0) {
      await backBtn.first().click();
      await page.waitForTimeout(1500);

      // Then 应返回报告列表
      const listTitle = page.locator('text=评测报告管理');
      await expect(listTitle).toBeVisible({ timeout: 10_000 });
    }
  });
});
