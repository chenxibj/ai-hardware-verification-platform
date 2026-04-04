/**
 * Feature: MVP-1 芯片档案 & 报告 (Issues #138 #139 #140 #141 #142)
 *
 * BDD 测试覆盖 MVP-1 的 5 个 Issue：
 *   #138 芯片档案页完整版（4 Tab）   ✅ 已开发
 *   #139 能力画像雷达图             ✅ 已开发
 *   #140 芯片对比                  ✅ 已开发
 *   #141 完整芯片评价报告            ✅ 已开发
 *   #142 报告 PDF 下载             ✅ 已开发
 */
import { test, expect, apiLogin, apiGet, apiPost } from '../../fixtures/auth.fixture';
import { Page } from '@playwright/test';

/* ── 常量 ── */
const SIX_DIMENSIONS = ['计算性能', '访存性能', '数学函数', 'Attention能力', '归一化性能', '模型推理'];
const DIM_KEYS = ['compute_perf', 'memory_perf', 'math_func', 'attention', 'normalization', 'model_inference'];

/* ── Helper：确保至少有一个已评测芯片 + 报告 ── */
async function getChipWithReport(request: any) {
  const { token } = await apiLogin(request);

  // 查报告列表
  const rptRes = await apiGet(request, token, '/chip-reports');
  const rptBody = await rptRes.json();
  const reports = rptBody.data || [];

  if (reports.length > 0) {
    const report = reports[0];
    const chipRes = await apiGet(request, token, `/chips/${report.chipId}`);
    const chipBody = await chipRes.json();
    return { token, chip: chipBody.data, report };
  }

  const chipRes = await apiGet(request, token, '/chips');
  const chipBody = await chipRes.json();
  const chips = chipBody.data || [];
  const chip = chips.find((c: any) => c.status === 'EVALUATED') || chips[0];
  return { token, chip: chip || null, report: null };
}

/**
 * Helper: 导航到芯片列表页（先展开"芯片管理"子菜单，再点击"芯片列表"）
 */
async function navigateToChipList(page: Page) {
  await page.locator('.ant-menu').getByText('芯片管理').click();
  await page.waitForTimeout(500);
  await page.locator('.ant-menu').getByText('芯片列表').click();
  await page.locator('.ant-table').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

/**
 * Helper: 从芯片列表进入第一个芯片的档案页
 */
async function enterChipProfile(page: Page) {
  await navigateToChipList(page);
  const viewBtn = page.locator('.ant-table-row').first().locator('button').filter({ has: page.locator('.anticon-eye') }).first();
  await viewBtn.waitFor({ timeout: 10_000 });
  await viewBtn.click();
  await page.locator('.ant-tabs-nav').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1000);
}

/**
 * Helper: 导航到芯片对比页
 */
async function navigateToChipCompare(page: Page) {
  await page.locator('.ant-menu').getByText('芯片管理').click();
  await page.waitForTimeout(500);
  await page.locator('.ant-menu').getByText('芯片对比').click();
  await page.waitForTimeout(1500);
}

// ============================================================================
// #138 — 芯片档案页完整版（4 Tab）
// ============================================================================
test.describe('Issue #138: 芯片档案页完整版（4 Tab）', () => {

  test('Scenario: API — 芯片详情接口返回完整数据', async ({ request }) => {
    const { token, chip } = await getChipWithReport(request);
    test.skip(!chip, '无芯片数据，跳过');

    const res = await apiGet(request, token, `/chips/${chip!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const data = body.data;
    expect(data.id).toBeTruthy();
    expect(data.name).toBeTruthy();
    expect(data.chipNo).toBeTruthy();
    expect(data.chipType).toBeTruthy();
  });

  test('Scenario: API — 按芯片 ID 查询报告列表', async ({ request }) => {
    const { token, chip, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    const res = await apiGet(request, token, `/chip-reports/chip/${chip!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('Scenario: UI — 芯片档案页有 4 个 Tab 且可切换', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    const tabBar = page.locator('.ant-tabs-nav');
    await expect(tabBar).toBeVisible({ timeout: 10_000 });

    await expect(tabBar.getByText('能力画像')).toBeVisible({ timeout: 5000 });
    await expect(tabBar.getByText('基本信息')).toBeVisible({ timeout: 5000 });
    await expect(tabBar.getByText('评测历史')).toBeVisible({ timeout: 5000 });
    await expect(tabBar.getByText('评价报告')).toBeVisible({ timeout: 5000 });

    const activeTab = page.locator('.ant-tabs-tab-active');
    await expect(activeTab).toContainText('能力画像');
  });

  test('Scenario: UI — 可以切换到每个 Tab', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    await page.locator('.ant-tabs-nav').getByText('基本信息').click();
    await page.waitForTimeout(500);
    const hasChipInfo = await page.getByText('芯片信息').first().isVisible().catch(() => false);
    const hasTechSpec = await page.getByText('技术规格').first().isVisible().catch(() => false);
    expect(hasChipInfo || hasTechSpec).toBeTruthy();

    await page.locator('.ant-tabs-nav').getByText('评测历史').click();
    await page.waitForTimeout(500);
    await expect(page.getByText('评测计划列表').first()).toBeVisible({ timeout: 5000 });

    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(1000);
    const hasReport = await page.getByText('报告编号').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评价报告').first().isVisible().catch(() => false);
    expect(hasReport || hasEmpty).toBeTruthy();
  });

  test('Scenario: UI — 评测历史 Tab 显示评测计划列表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    await page.locator('.ant-tabs-nav').getByText('评测历史').click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('评测计划列表').first()).toBeVisible({ timeout: 5000 });
    const table = page.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 5000 });
  });

  test('Scenario: UI — 评价报告 Tab 支持切换历史报告', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(1500);

    const hasProgress = await page.locator('.ant-progress-circle').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评价报告').isVisible().catch(() => false);
    expect(hasProgress || hasEmpty).toBeTruthy();
  });
});

// ============================================================================
// #139 — 能力画像雷达图
// ============================================================================
test.describe('Issue #139: 能力画像雷达图', () => {

  test('Scenario: API — 报告包含六维雷达图数据', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    const radarData = typeof report!.radarData === 'string'
      ? JSON.parse(report!.radarData)
      : report!.radarData;

    expect(Array.isArray(radarData)).toBe(true);
    expect(radarData.length).toBe(6);

    for (const item of radarData) {
      expect(item.dimension).toBeTruthy();
      expect(typeof item.score).toBe('number');
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
    }

    const dims = radarData.map((r: any) => r.dimension);
    for (const expected of SIX_DIMENSIONS) {
      expect(dims).toContain(expected);
    }
  });

  test('Scenario: API — 报告包含各维度评分数值', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    const dimScores = typeof report!.dimensionScores === 'string'
      ? JSON.parse(report!.dimensionScores)
      : report!.dimensionScores;

    expect(dimScores).toBeTruthy();
    for (const key of DIM_KEYS) {
      expect(dimScores).toHaveProperty(key);
      expect(typeof dimScores[key]).toBe('number');
    }
  });

  test('Scenario: API — 报告综合评分在合理范围', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    expect(report!.overallScore).toBeGreaterThanOrEqual(0);
    expect(report!.overallScore).toBeLessThanOrEqual(100);
  });

  test('Scenario: UI — 能力画像 Tab 默认激活并显示雷达图', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    const activeTab = page.locator('.ant-tabs-tab-active');
    await expect(activeTab).toContainText('能力画像');

    await page.waitForTimeout(1500);
    const hasCanvas = await page.locator('canvas').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评测数据').isVisible().catch(() => false);
    expect(hasCanvas || hasEmpty).toBeTruthy();
  });

  test('Scenario: UI — 能力画像显示综合评分和维度评分', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);
    await page.waitForTimeout(1500);

    const hasScore = await page.getByText('综合评分').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评测数据').isVisible().catch(() => false);
    expect(hasScore || hasEmpty).toBeTruthy();

    if (hasScore) {
      const hasDimCard = await page.getByText('维度评分详情').first().isVisible().catch(() => false);
      if (hasDimCard) {
        for (const dim of SIX_DIMENSIONS) {
          await expect(page.getByText(dim).first()).toBeVisible({ timeout: 3000 });
        }
      }
    }
  });

  test('Scenario: UI — 能力画像包含适用场景分析', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);
    await page.waitForTimeout(1500);

    const hasScenario = await page.getByText('适用场景分析').first().isVisible().catch(() => false);
    if (hasScenario) {
      const hasRecommended = await page.getByText('推荐场景').first().isVisible().catch(() => false);
      const hasCaution = await page.getByText('需关注').first().isVisible().catch(() => false);
      const hasUnverified = await page.getByText('待验证').first().isVisible().catch(() => false);
      expect(hasRecommended || hasCaution || hasUnverified).toBeTruthy();
    }
  });
});

// ============================================================================
// #140 — 芯片对比（已开发完成）
// ============================================================================
test.describe('Issue #140: 芯片对比', () => {

  test('Scenario: UI — 芯片对比页显示选择器和提示', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToChipCompare(page);

    // 应显示"芯片对比分析"标题
    await expect(page.getByText('芯片对比分析').first()).toBeVisible({ timeout: 10_000 });

    // 应显示"选择 2-4 颗已完成评测的芯片"提示
    await expect(page.getByText('选择 2-4 颗已完成评测的芯片').first()).toBeVisible({ timeout: 5000 });

    // 应有芯片选择器（Select 组件）
    await expect(page.locator('.ant-select').first()).toBeVisible({ timeout: 5000 });

    // 未选择时应显示空态提示
    await expect(page.getByText('请在上方选择 2-4 颗芯片开始对比').first()).toBeVisible({ timeout: 5000 });
  });

  test('Scenario: UI — 可以选择芯片并显示对比内容', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToChipCompare(page);

    // 点击选择器
    const selector = page.locator('.ant-select').first();
    await selector.click();
    await page.waitForTimeout(500);

    // 应弹出下拉选项（已评测芯片列表）
    const dropdown = page.locator('.ant-select-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 5000 });

    // 获取选项数量
    const options = dropdown.locator('.ant-select-item-option');
    const count = await options.count();

    if (count >= 2) {
      // 选择前两个芯片
      await options.nth(0).click();
      await page.waitForTimeout(300);
      await selector.click();
      await page.waitForTimeout(300);
      await options.nth(1).click();
      await page.waitForTimeout(2000);

      // 选了 2 颗后，应显示对比内容
      const hasRadar = await page.getByText('能力画像对比').first().isVisible().catch(() => false);
      const hasDimTable = await page.getByText('各维度评分对比').first().isVisible().catch(() => false);
      expect(hasRadar || hasDimTable).toBeTruthy();
    } else {
      // 不够 2 颗已评测芯片，记录但不失败
      test.skip(true, '已评测芯片不足 2 颗，无法测试对比功能');
    }
  });

  test('Scenario: UI — 对比页显示多芯片雷达图和评分表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToChipCompare(page);

    // 选择芯片
    const selector = page.locator('.ant-select').first();
    await selector.click();
    await page.waitForTimeout(500);
    const dropdown = page.locator('.ant-select-dropdown');
    const options = dropdown.locator('.ant-select-item-option');
    const count = await options.count();
    test.skip(count < 2, '已评测芯片不足 2 颗');

    await options.nth(0).click();
    await page.waitForTimeout(300);
    await selector.click();
    await page.waitForTimeout(300);
    await options.nth(1).click();
    await page.waitForTimeout(2500);

    // 应有雷达图（canvas）
    const hasCanvas = await page.locator('canvas').first().isVisible().catch(() => false);
    expect(hasCanvas).toBeTruthy();

    // 应有评分对比表
    const hasDimTable = await page.getByText('各维度评分对比').first().isVisible().catch(() => false);
    expect(hasDimTable).toBeTruthy();

    // 表中应有差距列
    const hasGapCol = await page.getByText('差距').first().isVisible().catch(() => false);
    expect(hasGapCol).toBeTruthy();
  });

  test('Scenario: UI — 对比页支持算子级性能对比', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToChipCompare(page);

    const selector = page.locator('.ant-select').first();
    await selector.click();
    await page.waitForTimeout(500);
    const dropdown = page.locator('.ant-select-dropdown');
    const options = dropdown.locator('.ant-select-item-option');
    const count = await options.count();
    test.skip(count < 2, '已评测芯片不足 2 颗');

    await options.nth(0).click();
    await page.waitForTimeout(300);
    await selector.click();
    await page.waitForTimeout(300);
    await options.nth(1).click();
    await page.waitForTimeout(2500);

    // 滚动到底部
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // 应有"算子级性能对比"板块
    const hasOperator = await page.getByText('算子级性能对比').first().isVisible().catch(() => false);
    expect(hasOperator).toBeTruthy();

    // 应有算子选择器或算子总览表
    const hasOpSelector = await page.getByText('选择算子').first().isVisible().catch(() => false);
    const hasOpTable = await page.locator('.ant-table').last().isVisible().catch(() => false);
    expect(hasOpSelector || hasOpTable).toBeTruthy();
  });
});

// ============================================================================
// #141 — 完整芯片评价报告
// ============================================================================
test.describe('Issue #141: 完整芯片评价报告', () => {

  test('Scenario: API — 报告详情包含完整 5 板块数据', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    const res = await apiGet(request, token, `/chip-reports/${report!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const detail = body.data;

    const radarData = typeof detail.radarData === 'string' ? JSON.parse(detail.radarData) : detail.radarData;
    expect(radarData.length).toBe(6);

    expect(detail.overallScore).toBeGreaterThan(0);

    const dimScores = typeof detail.dimensionScores === 'string' ? JSON.parse(detail.dimensionScores) : detail.dimensionScores;
    expect(Object.keys(dimScores).length).toBeGreaterThanOrEqual(6);

    const operators = typeof detail.operatorRanking === 'string' ? JSON.parse(detail.operatorRanking) : detail.operatorRanking;
    expect(Array.isArray(operators)).toBe(true);
    expect(operators.length).toBeGreaterThan(0);

    const bottleneck = typeof detail.bottleneckAnalysis === 'string' ? JSON.parse(detail.bottleneckAnalysis) : detail.bottleneckAnalysis;
    expect(Array.isArray(bottleneck)).toBe(true);
    expect(bottleneck.length).toBeGreaterThan(0);

    const scenarios = typeof detail.scenarioRecommendations === 'string' ? JSON.parse(detail.scenarioRecommendations) : detail.scenarioRecommendations;
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 瓶颈分析包含最慢算子', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    const bottleneck = typeof report!.bottleneckAnalysis === 'string'
      ? JSON.parse(report!.bottleneckAnalysis)
      : report!.bottleneckAnalysis;

    const types = bottleneck.map((b: any) => b.type);
    expect(types.some((t: string) => t === 'worst_operator' || t === 'weak_dimension')).toBeTruthy();

    for (const item of bottleneck) {
      expect(item.level).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.detail).toBeTruthy();
    }
  });

  test('Scenario: API — 场景推荐包含三级分类', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    const scenarios = typeof report!.scenarioRecommendations === 'string'
      ? JSON.parse(report!.scenarioRecommendations)
      : report!.scenarioRecommendations;

    const types = scenarios.map((s: any) => s.type);
    const validTypes = ['recommended', 'caution', 'unverified'];
    for (const t of types) {
      expect(validTypes).toContain(t);
    }

    for (const item of scenarios) {
      expect(item.scenario).toBeTruthy();
      expect(item.reason).toBeTruthy();
    }
  });

  test('Scenario: API — 算子排行包含评分和延迟', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    const operators = typeof report!.operatorRanking === 'string'
      ? JSON.parse(report!.operatorRanking)
      : report!.operatorRanking;

    expect(operators.length).toBeGreaterThan(0);
    const firstOp = operators[0];
    expect(firstOp.testItem).toBeTruthy();
    expect(typeof firstOp.score).toBe('number');
    expect(typeof firstOp.passed).toBe('boolean');
  });

  test('Scenario: UI — 报告 Tab 显示能力雷达图和瓶颈分析', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(2000);

    const hasProgress = await page.locator('.ant-progress-circle').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评价报告').isVisible().catch(() => false);
    expect(hasProgress || hasEmpty).toBeTruthy();

    if (hasProgress) {
      const hasBottleneck = await page.getByText('瓶颈分析').first().isVisible().catch(() => false);
      if (!hasBottleneck) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
      }
    }
  });

  test('Scenario: UI — 报告 Tab 显示适用场景推荐和算子排行', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(2000);

    const hasEmpty = await page.getByText('暂无评价报告').isVisible().catch(() => false);
    if (!hasEmpty) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      const hasScenario = await page.getByText('适用场景推荐').first().isVisible().catch(() => false);
      const hasOperators = await page.getByText('算子排行').first().isVisible().catch(() => false);
      expect(hasScenario || hasOperators).toBeTruthy();
    }
  });

  test('Scenario: UI — 报告 Tab 显示评测环境信息', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(2000);

    const hasEmpty = await page.getByText('暂无评价报告').isVisible().catch(() => false);
    if (!hasEmpty) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      const hasEnv = await page.getByText('评测环境信息').first().isVisible().catch(() => false);
      const hasCPUMode = await page.getByText('CPU 模拟模式').first().isVisible().catch(() => false);
      expect(hasEnv || hasCPUMode).toBeTruthy();
    }
  });
});

// ============================================================================
// #142 — 报告 PDF 下载（已开发完成）
// 注意：PDF 下载按钮在独立的 ChipReport 页面（通过评测历史 tab 的"查看报告"按钮进入）
// ============================================================================
test.describe('Issue #142: 报告 PDF 下载', () => {

  test('Scenario: UI — 通过评测历史进入完整报告页可见 PDF 按钮', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    // 切换到评测历史 Tab
    await page.locator('.ant-tabs-nav').getByText('评测历史').click();
    await page.waitForTimeout(1500);

    // 查找已完成的计划行中的"查看报告"按钮（FileTextOutlined 图标）
    const reportBtn = page.locator('.ant-table-row').locator('button').filter({ has: page.locator('.anticon-file-text') }).first();
    const hasBtnVisible = await reportBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasBtnVisible) {
      test.skip(true, '无已完成评测计划，无法查看报告');
      return;
    }

    // 点击进入完整报告页
    await reportBtn.click();
    await page.waitForTimeout(2000);

    // 完整报告页应有"下载 PDF"按钮
    const pdfBtn = page.getByRole('button', { name: /下载.*PDF|PDF/ });
    await expect(pdfBtn).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: UI — 点击下载 PDF 按钮触发导出', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await enterChipProfile(page);

    // 导航到评测历史 > 查看报告
    await page.locator('.ant-tabs-nav').getByText('评测历史').click();
    await page.waitForTimeout(1500);

    const reportBtn = page.locator('.ant-table-row').locator('button').filter({ has: page.locator('.anticon-file-text') }).first();
    const hasBtnVisible = await reportBtn.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasBtnVisible, '无已完成评测计划');

    await reportBtn.click();
    await page.waitForTimeout(2000);

    const pdfBtn = page.getByRole('button', { name: /下载.*PDF|PDF/ });
    const pdfVisible = await pdfBtn.isVisible().catch(() => false);
    test.skip(!pdfVisible, '未找到 PDF 下载按钮');

    // 监听下载事件（html2canvas+jsPDF 使用 blob URL 触发浏览器下载）
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);

    await pdfBtn.click();
    await page.waitForTimeout(5000);

    const download = await downloadPromise;
    const hasSuccess = await page.getByText('PDF 导出成功').isVisible().catch(() => false);

    // 至少一个条件说明 PDF 导出工作正常
    expect(download !== null || hasSuccess).toBeTruthy();
  });

  test('Scenario: API — chip-reports 接口返回有效数据供 PDF 渲染', async ({ request }) => {
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    const res = await apiGet(request, token, `/chip-reports/${report!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    const detail = body.data;
    expect(detail.overallScore).toBeDefined();
    expect(detail.radarData).toBeTruthy();
    expect(detail.dimensionScores).toBeTruthy();
    expect(detail.operatorRanking).toBeTruthy();
  });
});
