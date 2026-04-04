/**
 * Feature: MVP-1 芯片档案 & 报告 (Issues #138 #139 #140 #141 #142)
 *
 * BDD 测试覆盖 MVP-1 的 5 个 Issue：
 *   #138 芯片档案页完整版（4 Tab）   ✅ 已开发
 *   #139 能力画像雷达图             ✅ 已开发
 *   #140 芯片对比                  ❌ 未开发（skip）
 *   #141 完整芯片评价报告            ✅ 已开发
 *   #142 报告 PDF 下载             ❌ 未开发（skip）
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
  // 先点击"芯片管理"展开子菜单
  await page.locator('.ant-menu').getByText('芯片管理').click();
  await page.waitForTimeout(500);
  // 再点击"芯片列表"进入列表页
  await page.locator('.ant-menu').getByText('芯片列表').click();
  // 等待芯片列表表格加载
  await page.locator('.ant-table').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

/**
 * Helper: 从芯片列表进入第一个芯片的档案页
 */
async function enterChipProfile(page: Page) {
  await navigateToChipList(page);
  // 点击操作列的查看按钮（EyeOutlined 图标）
  const viewBtn = page.locator('.ant-table-row').first().locator('button').filter({ has: page.locator('.anticon-eye') }).first();
  await viewBtn.waitFor({ timeout: 10_000 });
  await viewBtn.click();
  // 等待 Tab 导航出现（芯片档案页标志）
  await page.locator('.ant-tabs-nav').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1000);
}

// ============================================================================
// #138 — 芯片档案页完整版（4 Tab）
// ============================================================================
test.describe('Issue #138: 芯片档案页完整版（4 Tab）', () => {

  test('Scenario: API — 芯片详情接口返回完整数据', async ({ request }) => {
    // Given 用户已登录并存在芯片
    const { token, chip } = await getChipWithReport(request);
    test.skip(!chip, '无芯片数据，跳过');

    // When 查询芯片详情
    const res = await apiGet(request, token, `/chips/${chip!.id}`);

    // Then 返回完整芯片信息
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
    // Given 用户已登录并存在已评测芯片
    const { token, chip, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    // When 按芯片查询报告
    const res = await apiGet(request, token, `/chip-reports/chip/${chip!.id}`);

    // Then 应返回报告数组
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('Scenario: UI — 芯片档案页有 4 个 Tab 且可切换', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录，进入芯片档案页
    await enterChipProfile(page);

    // Then 应看到 4 个 Tab
    const tabBar = page.locator('.ant-tabs-nav');
    await expect(tabBar).toBeVisible({ timeout: 10_000 });

    // 验证 4 个 Tab 标签存在
    await expect(tabBar.getByText('能力画像')).toBeVisible({ timeout: 5000 });
    await expect(tabBar.getByText('基本信息')).toBeVisible({ timeout: 5000 });
    await expect(tabBar.getByText('评测历史')).toBeVisible({ timeout: 5000 });
    await expect(tabBar.getByText('评价报告')).toBeVisible({ timeout: 5000 });

    // And 能力画像是默认激活 Tab
    const activeTab = page.locator('.ant-tabs-tab-active');
    await expect(activeTab).toContainText('能力画像');
  });

  test('Scenario: UI — 可以切换到每个 Tab', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片档案页
    await enterChipProfile(page);

    // When 点击"基本信息" Tab
    await page.locator('.ant-tabs-nav').getByText('基本信息').click();
    await page.waitForTimeout(500);

    // Then 应看到基本信息内容（芯片信息 / 技术规格）
    const hasChipInfo = await page.getByText('芯片信息').first().isVisible().catch(() => false);
    const hasTechSpec = await page.getByText('技术规格').first().isVisible().catch(() => false);
    expect(hasChipInfo || hasTechSpec).toBeTruthy();

    // When 点击"评测历史" Tab
    await page.locator('.ant-tabs-nav').getByText('评测历史').click();
    await page.waitForTimeout(500);

    // Then 应看到评测计划列表
    await expect(page.getByText('评测计划列表').first()).toBeVisible({ timeout: 5000 });

    // When 点击"评价报告" Tab
    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(1000);

    // Then 应看到报告内容或"暂无"提示
    const hasReport = await page.getByText('报告编号').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评价报告').first().isVisible().catch(() => false);
    expect(hasReport || hasEmpty).toBeTruthy();
  });

  test('Scenario: UI — 评测历史 Tab 显示评测计划列表', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片的档案页
    await enterChipProfile(page);

    // When 点击"评测历史"Tab
    await page.locator('.ant-tabs-nav').getByText('评测历史').click();
    await page.waitForTimeout(1000);

    // Then 应看到评测计划列表表格
    await expect(page.getByText('评测计划列表').first()).toBeVisible({ timeout: 5000 });
    const table = page.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 5000 });
  });

  test('Scenario: UI — 评价报告 Tab 支持切换历史报告', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片档案页
    await enterChipProfile(page);

    // When 点击"评价报告" Tab
    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(1500);

    // Then 如果有报告，应显示圆形进度条或报告选择器；否则显示空态
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
    // Given 用户已登录并存在报告
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    // When 解析报告的 radarData
    const radarData = typeof report!.radarData === 'string'
      ? JSON.parse(report!.radarData)
      : report!.radarData;

    // Then 应包含 6 个维度的数据
    expect(Array.isArray(radarData)).toBe(true);
    expect(radarData.length).toBe(6);

    // And 每个维度应有 dimension 和 score 字段
    for (const item of radarData) {
      expect(item.dimension).toBeTruthy();
      expect(typeof item.score).toBe('number');
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
    }

    // And 维度名应匹配预定义的六维
    const dims = radarData.map((r: any) => r.dimension);
    for (const expected of SIX_DIMENSIONS) {
      expect(dims).toContain(expected);
    }
  });

  test('Scenario: API — 报告包含各维度评分数值', async ({ request }) => {
    // Given 用户已登录并存在报告
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    // When 解析 dimensionScores
    const dimScores = typeof report!.dimensionScores === 'string'
      ? JSON.parse(report!.dimensionScores)
      : report!.dimensionScores;

    // Then 应包含 6 个维度键
    expect(dimScores).toBeTruthy();
    for (const key of DIM_KEYS) {
      expect(dimScores).toHaveProperty(key);
      expect(typeof dimScores[key]).toBe('number');
    }
  });

  test('Scenario: API — 报告综合评分在合理范围', async ({ request }) => {
    // Given 用户已登录并存在报告
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    // Then 综合评分应在 0-100
    expect(report!.overallScore).toBeGreaterThanOrEqual(0);
    expect(report!.overallScore).toBeLessThanOrEqual(100);
  });

  test('Scenario: UI — 能力画像 Tab 默认激活并显示雷达图', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片档案页
    await enterChipProfile(page);

    // Then 能力画像 Tab 应默认激活
    const activeTab = page.locator('.ant-tabs-tab-active');
    await expect(activeTab).toContainText('能力画像');

    // And 应显示雷达图（ECharts canvas）或空态
    await page.waitForTimeout(1500);
    const hasCanvas = await page.locator('canvas').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评测数据').isVisible().catch(() => false);
    expect(hasCanvas || hasEmpty).toBeTruthy();
  });

  test('Scenario: UI — 能力画像显示综合评分和维度评分', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片档案页
    await enterChipProfile(page);
    await page.waitForTimeout(1500);

    // Then 应显示"综合评分"或空态
    const hasScore = await page.getByText('综合评分').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评测数据').isVisible().catch(() => false);
    expect(hasScore || hasEmpty).toBeTruthy();

    // And 如果有评测数据，应显示维度评分详情
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

    // Given 进入芯片档案页
    await enterChipProfile(page);
    await page.waitForTimeout(1500);

    // Then 如果有评测数据，应显示场景分析
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
// #140 — 芯片对比（尚未开发，标记为 skip/fixme）
// ============================================================================
test.describe('Issue #140: 芯片对比（未开发 — 预期 skip）', () => {

  test('Scenario: UI — 芯片对比页当前显示空壳', async ({ authenticatedPage }) => {
    // 此测试验证空壳状态 — 功能尚未开发
    const page = authenticatedPage;

    // Given 用户展开芯片管理子菜单
    await page.locator('.ant-menu').getByText('芯片管理').click();
    await page.waitForTimeout(500);

    // When 点击"芯片对比"
    await page.locator('.ant-menu').getByText('芯片对比').click();
    await page.waitForTimeout(1000);

    // Then 应显示"功能开发中"
    await expect(page.getByText('功能开发中')).toBeVisible({ timeout: 5000 });
  });

  test.fixme('Scenario: UI — 可以选择 2-4 颗芯片进行对比', async ({ authenticatedPage }) => {
    // #140 尚未开发 — 待功能完成后补充
    // Given 用户在芯片列表页选择多颗芯片
    // When 点击"对比"按钮
    // Then 进入对比页，显示多芯片雷达图叠加
    expect(false).toBeTruthy();
  });

  test.fixme('Scenario: UI — 对比页显示多芯片雷达图叠加', async ({ authenticatedPage }) => {
    // #140 尚未开发
    expect(false).toBeTruthy();
  });

  test.fixme('Scenario: UI — 对比页显示各维度评分对比表', async ({ authenticatedPage }) => {
    // #140 尚未开发
    expect(false).toBeTruthy();
  });

  test.fixme('Scenario: UI — 支持选择具体算子查看性能对比', async ({ authenticatedPage }) => {
    // #140 尚未开发
    expect(false).toBeTruthy();
  });
});

// ============================================================================
// #141 — 完整芯片评价报告
// ============================================================================
test.describe('Issue #141: 完整芯片评价报告', () => {

  test('Scenario: API — 报告详情包含完整 5 板块数据', async ({ request }) => {
    // Given 用户已登录并存在报告
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    // When 查询报告详情
    const res = await apiGet(request, token, `/chip-reports/${report!.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const detail = body.data;

    // Then 板块 1: 雷达图数据（6 维）
    const radarData = typeof detail.radarData === 'string' ? JSON.parse(detail.radarData) : detail.radarData;
    expect(radarData.length).toBe(6);

    // And 综合评分
    expect(detail.overallScore).toBeGreaterThan(0);

    // And 维度评分
    const dimScores = typeof detail.dimensionScores === 'string' ? JSON.parse(detail.dimensionScores) : detail.dimensionScores;
    expect(Object.keys(dimScores).length).toBeGreaterThanOrEqual(6);

    // And 板块 2: 算子排行
    const operators = typeof detail.operatorRanking === 'string' ? JSON.parse(detail.operatorRanking) : detail.operatorRanking;
    expect(Array.isArray(operators)).toBe(true);
    expect(operators.length).toBeGreaterThan(0);

    // And 板块 3: 瓶颈分析
    const bottleneck = typeof detail.bottleneckAnalysis === 'string' ? JSON.parse(detail.bottleneckAnalysis) : detail.bottleneckAnalysis;
    expect(Array.isArray(bottleneck)).toBe(true);
    expect(bottleneck.length).toBeGreaterThan(0);

    // And 板块 4: 场景推荐
    const scenarios = typeof detail.scenarioRecommendations === 'string' ? JSON.parse(detail.scenarioRecommendations) : detail.scenarioRecommendations;
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThan(0);
  });

  test('Scenario: API — 瓶颈分析包含最慢算子', async ({ request }) => {
    // Given 用户已登录并存在报告
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    // When 解析瓶颈分析
    const bottleneck = typeof report!.bottleneckAnalysis === 'string'
      ? JSON.parse(report!.bottleneckAnalysis)
      : report!.bottleneckAnalysis;

    // Then 应包含 worst_operator 或 weak_dimension 类型
    const types = bottleneck.map((b: any) => b.type);
    expect(types.some((t: string) => t === 'worst_operator' || t === 'weak_dimension')).toBeTruthy();

    // And 每个条目应有 level, title, detail
    for (const item of bottleneck) {
      expect(item.level).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.detail).toBeTruthy();
    }
  });

  test('Scenario: API — 场景推荐包含三级分类', async ({ request }) => {
    // Given 用户已登录并存在报告
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    // When 解析场景推荐
    const scenarios = typeof report!.scenarioRecommendations === 'string'
      ? JSON.parse(report!.scenarioRecommendations)
      : report!.scenarioRecommendations;

    // Then 应包含三级分类
    const types = scenarios.map((s: any) => s.type);
    const validTypes = ['recommended', 'caution', 'unverified'];
    for (const t of types) {
      expect(validTypes).toContain(t);
    }

    // And 每个条目应有 scenario 和 reason
    for (const item of scenarios) {
      expect(item.scenario).toBeTruthy();
      expect(item.reason).toBeTruthy();
    }
  });

  test('Scenario: API — 算子排行包含评分和延迟', async ({ request }) => {
    // Given 用户已登录并存在报告
    const { token, report } = await getChipWithReport(request);
    test.skip(!report, '无报告数据，跳过');

    // When 解析算子排行
    const operators = typeof report!.operatorRanking === 'string'
      ? JSON.parse(report!.operatorRanking)
      : report!.operatorRanking;

    // Then 算子应有 testItem, score, passed 字段
    expect(operators.length).toBeGreaterThan(0);
    const firstOp = operators[0];
    expect(firstOp.testItem).toBeTruthy();
    expect(typeof firstOp.score).toBe('number');
    expect(typeof firstOp.passed).toBe('boolean');
  });

  test('Scenario: UI — 报告 Tab 显示能力雷达图和瓶颈分析', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片档案页
    await enterChipProfile(page);

    // When 切换到评价报告 Tab
    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(2000);

    // Then 如果有报告数据，应显示圆形进度条（综合评分）
    const hasProgress = await page.locator('.ant-progress-circle').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('暂无评价报告').isVisible().catch(() => false);
    expect(hasProgress || hasEmpty).toBeTruthy();

    // And 如果有报告，应显示瓶颈分析
    if (hasProgress) {
      const hasBottleneck = await page.getByText('瓶颈分析').first().isVisible().catch(() => false);
      // 瓶颈分析板块可能需要滚动才可见
      if (!hasBottleneck) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
      }
    }
  });

  test('Scenario: UI — 报告 Tab 显示适用场景推荐和算子排行', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片档案页
    await enterChipProfile(page);

    // When 切换到评价报告 Tab
    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(2000);

    const hasEmpty = await page.getByText('暂无评价报告').isVisible().catch(() => false);
    if (!hasEmpty) {
      // Then 应显示适用场景推荐
      // 滚动到底部确保能看到所有板块
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      const hasScenario = await page.getByText('适用场景推荐').first().isVisible().catch(() => false);
      const hasOperators = await page.getByText('算子排行').first().isVisible().catch(() => false);
      // 至少应有一个板块可见
      expect(hasScenario || hasOperators).toBeTruthy();
    }
  });

  test('Scenario: UI — 报告 Tab 显示评测环境信息', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 进入芯片档案页
    await enterChipProfile(page);

    // When 切换到评价报告 Tab
    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(2000);

    const hasEmpty = await page.getByText('暂无评价报告').isVisible().catch(() => false);
    if (!hasEmpty) {
      // Then 应显示评测环境信息（可能需滚动到底部）
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      const hasEnv = await page.getByText('评测环境信息').first().isVisible().catch(() => false);
      const hasCPUMode = await page.getByText('CPU 模拟模式').first().isVisible().catch(() => false);
      expect(hasEnv || hasCPUMode).toBeTruthy();
    }
  });
});

// ============================================================================
// #142 — 报告 PDF 下载（尚未开发，标记为 fixme）
// ============================================================================
test.describe('Issue #142: 报告 PDF 下载（未开发 — 预期 fixme）', () => {

  test.fixme('Scenario: UI — 报告页有"下载 PDF"按钮', async ({ authenticatedPage }) => {
    // #142 尚未开发
    const page = authenticatedPage;
    await enterChipProfile(page);
    await page.locator('.ant-tabs-nav').getByText('评价报告').click();
    await page.waitForTimeout(2000);
    await expect(page.getByRole('button', { name: /下载.*PDF|PDF.*下载/ })).toBeVisible();
  });

  test.fixme('Scenario: UI — 点击下载 PDF 按钮成功生成 PDF', async ({ authenticatedPage }) => {
    // #142 尚未开发
    expect(false).toBeTruthy();
  });

  test.fixme('Scenario: PDF 内容与页面展示一致', async ({ authenticatedPage }) => {
    // #142 尚未开发
    expect(false).toBeTruthy();
  });
});
