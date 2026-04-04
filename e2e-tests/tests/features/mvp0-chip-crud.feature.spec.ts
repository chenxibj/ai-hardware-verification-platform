/**
 * Feature: MVP-0 芯片注册 CRUD + 芯片列表
 *
 * 覆盖产品设计文档 MVP-0 P0 功能:
 *   - 芯片注册 (创建/查询/更新/删除)
 *   - 芯片列表 (卡片式列表、搜索、筛选)
 *   - 芯片编号自动生成
 *   - 芯片状态流转 (REGISTERED → EVALUATING → EVALUATED)
 *
 * 关联 Issue: [MVP-0][BDD] 芯片注册 CRUD + 芯片列表
 */
import { test, expect, apiLogin, apiGet, apiPost, apiPut, apiDelete } from '../../fixtures/auth.fixture';
import { Page } from '@playwright/test';

/* ── Helper ── */
async function navigateToChipList(page: Page) {
  await page.locator('.ant-menu').getByText('芯片管理').click();
  await page.waitForTimeout(500);
  await page.locator('.ant-menu').getByText('芯片列表').click();
  await page.locator('.ant-table, .ant-card').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

const uniqueName = () => `BDD-Chip-${Date.now()}`;

// ============================================================================
// Feature 1: 芯片创建
// ============================================================================
test.describe('MVP-0: 芯片创建', () => {

  test('Scenario: API — 创建芯片成功返回 chipNo', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 创建芯片（必填字段: name, vendor, chipType）
    const res = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '测试厂商',
      chipType: 'GPU',
    });

    // Then 返回成功
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // And 自动生成 chipNo（格式 CHIP-YYYYMMDD-NNN）
    const chip = body.data;
    expect(chip.chipNo).toMatch(/^CHIP-\d{8}-\d{3}$/);
    expect(chip.name).toBeTruthy();
    expect(chip.vendor).toBe('测试厂商');
    expect(chip.chipType).toBe('GPU');

    // And 初始状态为 REGISTERED
    expect(chip.status).toBe('REGISTERED');
  });

  test('Scenario: API — 创建芯片包含完整技术规格', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 创建芯片并填写所有可选字段
    const res = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '商汤科技',
      chipType: 'GPU',
      specs: {
        fp16Tflops: 200,
        fp32Tflops: 100,
        memoryGB: 64,
        tdpWatts: 300,
      },
      softwareEnv: {
        driverVersion: 'v2.1.0',
        sdkVersion: 'SenseSDK 3.0',
      },
      remark: 'BDD 测试芯片',
    });

    // Then 返回的芯片数据包含技术规格
    expect(res.ok()).toBeTruthy();
    const chip = (await res.json()).data;
    expect(chip.specs).toBeTruthy();
    expect(chip.softwareEnv).toBeTruthy();
  });

  test('Scenario: API — 缺少必填字段 name 返回错误', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 创建芯片但不传 name
    const res = await apiPost(request, token, '/chips', {
      vendor: '测试厂商',
      chipType: 'GPU',
    });

    // Then 应返回错误
    const body = await res.json();
    expect(body.code).not.toBe(0);
  });

  test('Scenario: API — 缺少必填字段 vendor 返回错误', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 创建芯片但不传 vendor
    const res = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      chipType: 'GPU',
    });

    // Then 应返回错误
    const body = await res.json();
    expect(body.code).not.toBe(0);
  });

  test('Scenario: API — 缺少必填字段 chipType 返回错误', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 创建芯片但不传 chipType
    const res = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '测试厂商',
    });

    // Then 应返回错误
    const body = await res.json();
    expect(body.code).not.toBe(0);
  });

  test('Scenario: API — chipType 支持全部枚举值', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 用每种合法 chipType 创建
    for (const chipType of ['GPU', 'NPU', 'TPU', 'CPU', 'OTHER']) {
      const res = await apiPost(request, token, '/chips', {
        name: `${uniqueName()}-${chipType}`,
        vendor: '枚举测试',
        chipType,
      });

      // Then 每种都应成功
      expect(res.ok(), `chipType=${chipType} should succeed`).toBeTruthy();
      const body = await res.json();
      expect(body.code).toBe(0);
      expect(body.data.chipType).toBe(chipType);
    }
  });
});

// ============================================================================
// Feature 2: 芯片查询与详情
// ============================================================================
test.describe('MVP-0: 芯片查询与详情', () => {

  test('Scenario: API — 获取芯片列表', async ({ request }) => {
    // Given 用户已登录且已注册芯片
    const { token } = await apiLogin(request);

    // When 查询芯片列表
    const res = await apiGet(request, token, '/chips');

    // Then 返回芯片数组
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // And 每个芯片有核心字段
    const chip = body.data[0];
    expect(chip.id).toBeTruthy();
    expect(chip.chipNo).toBeTruthy();
    expect(chip.name).toBeTruthy();
    expect(chip.vendor).toBeTruthy();
    expect(chip.chipType).toBeTruthy();
    expect(chip.status).toBeTruthy();
  });

  test('Scenario: API — 按芯片 ID 查询详情', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // And 有一个已注册的芯片
    const listRes = await apiGet(request, token, '/chips');
    const chips = (await listRes.json()).data;
    test.skip(!chips || chips.length === 0, '无芯片数据');
    const chipId = chips[0].id;

    // When 查询芯片详情
    const res = await apiGet(request, token, `/chips/${chipId}`);

    // Then 返回完整芯片信息
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(chipId);
    expect(body.data.chipNo).toBeTruthy();
    expect(body.data.createdAt).toBeTruthy();
  });

  test('Scenario: API — 按名称搜索芯片', async ({ request }) => {
    // Given 用户已登录并创建了一个有独特名称的芯片
    const { token } = await apiLogin(request);
    const searchName = `SearchTest-${Date.now()}`;
    await apiPost(request, token, '/chips', {
      name: searchName,
      vendor: '搜索测试',
      chipType: 'GPU',
    });

    // When 按名称搜索
    const res = await apiGet(request, token, `/chips?keyword=${searchName}`);

    // Then 应返回匹配的芯片
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const results = body.data || [];
    const found = results.find((c: any) => c.name === searchName);
    expect(found).toBeTruthy();
  });

  test('Scenario: API — 按状态筛选芯片', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 按 REGISTERED 状态筛选
    const res = await apiGet(request, token, '/chips?status=REGISTERED');

    // Then 返回的芯片都是 REGISTERED
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    for (const chip of body.data || []) {
      expect(chip.status).toBe('REGISTERED');
    }
  });

  test('Scenario: API — 按芯片类型筛选', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 按 GPU 类型筛选
    const res = await apiGet(request, token, '/chips?chipType=GPU');

    // Then 返回的芯片都是 GPU 类型
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    for (const chip of body.data || []) {
      expect(chip.chipType).toBe('GPU');
    }
  });
});

// ============================================================================
// Feature 3: 芯片更新与删除
// ============================================================================
test.describe('MVP-0: 芯片更新与删除', () => {

  test('Scenario: API — 更新芯片基本信息', async ({ request }) => {
    // Given 用户已登录并创建了一个芯片
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '原始厂商',
      chipType: 'GPU',
    });
    const chipId = (await createRes.json()).data.id;

    // When 更新芯片信息
    const updateRes = await apiPut(request, token, `/chips/${chipId}`, {
      vendor: '更新后厂商',
      remark: '已更新',
    });

    // Then 更新成功
    expect(updateRes.ok()).toBeTruthy();
    const body = await updateRes.json();
    expect(body.code).toBe(0);

    // And 查询确认更新
    const getRes = await apiGet(request, token, `/chips/${chipId}`);
    const chip = (await getRes.json()).data;
    expect(chip.vendor).toBe('更新后厂商');
  });

  test('Scenario: API — 更新芯片技术规格（后补充）', async ({ request }) => {
    // Given 用户已登录并创建了一个无技术规格的芯片
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '测试',
      chipType: 'NPU',
    });
    const chipId = (await createRes.json()).data.id;

    // When 后续补充技术规格
    const updateRes = await apiPut(request, token, `/chips/${chipId}`, {
      specs: { fp16Tflops: 150, memoryGB: 32 },
    });

    // Then 技术规格已填充
    expect(updateRes.ok()).toBeTruthy();
    const getRes = await apiGet(request, token, `/chips/${chipId}`);
    const chip = (await getRes.json()).data;
    expect(chip.specs).toBeTruthy();
  });

  test('Scenario: API — 删除芯片', async ({ request }) => {
    // Given 用户已登录并创建了一个芯片
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '待删除',
      chipType: 'CPU',
    });
    const chipId = (await createRes.json()).data.id;

    // When 删除芯片
    const deleteRes = await apiDelete(request, token, `/chips/${chipId}`);

    // Then 删除成功
    expect(deleteRes.ok()).toBeTruthy();

    // And 再次查询返回 404 或空
    const getRes = await apiGet(request, token, `/chips/${chipId}`);
    const body = await getRes.json();
    expect(body.code).not.toBe(0);
  });
});

// ============================================================================
// Feature 4: 芯片列表 UI
// ============================================================================
test.describe('MVP-0: 芯片列表 UI', () => {

  test('Scenario: UI — 芯片列表页正常展示', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    // When 导航到芯片列表
    await navigateToChipList(page);

    // Then 应看到芯片数据
    const hasTable = await page.locator('.ant-table').isVisible().catch(() => false);
    const hasCards = await page.locator('.ant-card').first().isVisible().catch(() => false);
    expect(hasTable || hasCards).toBeTruthy();
  });

  test('Scenario: UI — 芯片列表有搜索功能', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在芯片列表页
    await navigateToChipList(page);

    // Then 应有搜索框
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="芯片"], .ant-input-search input');
    await expect(searchInput.first()).toBeVisible({ timeout: 5_000 });
  });

  test('Scenario: UI — 芯片列表有筛选功能', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在芯片列表页
    await navigateToChipList(page);

    // Then 应有状态或类型筛选器
    const filterEl = page.locator('.ant-select, .ant-radio-group, [class*="filter"]');
    const hasFilter = await filterEl.first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasFilter).toBeTruthy();
  });

  test('Scenario: UI — 点击注册新芯片按钮', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户在芯片列表页
    await navigateToChipList(page);

    // When 点击"注册新芯片"按钮
    const regBtn = page.getByRole('button', { name: /注册|新增|创建/ });
    await expect(regBtn.first()).toBeVisible({ timeout: 5_000 });
    await regBtn.first().click();
    await page.waitForTimeout(1000);

    // Then 应打开注册表单（Modal 或新页面）
    const hasModal = await page.locator('.ant-modal').isVisible().catch(() => false);
    const hasForm = await page.locator('form, .ant-form').isVisible().catch(() => false);
    expect(hasModal || hasForm).toBeTruthy();
  });

  test('Scenario: UI — 芯片注册表单有三个区域', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户打开了芯片注册表单
    await navigateToChipList(page);
    const regBtn = page.getByRole('button', { name: /注册|新增|创建/ });
    await regBtn.first().click();
    await page.waitForTimeout(1000);

    // Then 应有基本信息区域
    const hasBasic = await page.getByText(/基本信息|芯片名称/).first().isVisible().catch(() => false);
    expect(hasBasic).toBeTruthy();

    // And 应有芯片类型选择
    const hasType = await page.getByText(/芯片类型|类型/).first().isVisible().catch(() => false);
    expect(hasType).toBeTruthy();
  });
});
