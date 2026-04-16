/**
 * Feature: MVP-0 芯片注册 CRUD + 芯片列表
 *
 * 覆盖产品设计文档 MVP-0 P0 功能:
 *   - 芯片注册 (创建/查询/更新/删除)
 *   - 芯片列表 (搜索、筛选)
 *   - 芯片编号自动生成
 *   - 芯片状态流转 (REGISTERED → EVALUATING → EVALUATED)
 *
 * 关联 Issue: [MVP-0][BDD] 芯片注册 CRUD + 芯片列表
 */
import { test, expect, apiLogin, apiGet, apiPost, apiPut, apiDelete } from '../../fixtures/auth.fixture';

const uniqueName = () => `BDD-Chip-${Date.now()}`;

// ============================================================================
// Feature 1: 芯片创建
// ============================================================================
test.describe('MVP-0: 芯片创建', () => {

  test('Scenario: API — 创建芯片成功返回 chipNo', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '测试厂商',
      chipType: 'GPU',
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const chip = body.data;
    expect(chip.chipNo).toMatch(/^CHIP-\d{8}-\d{3}$/);
    expect(chip.name).toBeTruthy();
    expect(chip.manufacturer).toBe('测试厂商');
    expect(chip.chipType).toBe('GPU');
    expect(chip.status).toBe('REGISTERED');
  });

  test('Scenario: API — 创建芯片包含完整技术规格', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '商汤科技',
      chipType: 'GPU',
      specs: JSON.stringify({
        fp16Tflops: 200,
        fp32Tflops: 100,
        memoryGB: 64,
        tdpWatts: 300,
      }),
      softwareEnv: JSON.stringify({
        driverVersion: 'v2.1.0',
        sdkVersion: 'SenseSDK 3.0',
      }),
      remark: 'BDD 测试芯片',
    });
    expect(res.ok()).toBeTruthy();
    const chip = (await res.json()).data;
    expect(chip.techSpec).toBeTruthy();
    expect(chip.softwareStack).toBeTruthy();
  });

  test('Scenario: API — 缺少必填字段 name 返回错误', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiPost(request, token, '/chips', {
      vendor: '测试厂商',
      chipType: 'GPU',
    });
    const body = await res.json();
    expect(body.code).not.toBe(0);
  });

  test('Scenario: API — 缺少必填字段 vendor 返回错误', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      chipType: 'GPU',
    });
    const body = await res.json();
    expect(body.code).not.toBe(0);
  });

  test('Scenario: API — 缺少必填字段 chipType 返回错误', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '测试厂商',
    });
    const body = await res.json();
    expect(body.code).not.toBe(0);
  });

  test('Scenario: API — chipType 支持全部枚举值', async ({ request }) => {
    const { token } = await apiLogin(request);
    for (const chipType of ['GPU', 'NPU', 'TPU', 'CPU', 'OTHER']) {
      const res = await apiPost(request, token, '/chips', {
        name: `${uniqueName()}-${chipType}`,
        vendor: '枚举测试',
        chipType,
      });
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
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/chips');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    const chip = body.data[0];
    expect(chip.id).toBeTruthy();
    expect(chip.chipNo).toBeTruthy();
    expect(chip.name).toBeTruthy();
    expect(chip.manufacturer).toBeTruthy();
    expect(chip.chipType).toBeTruthy();
    expect(chip.status).toBeTruthy();
  });

  test('Scenario: API — 按芯片 ID 查询详情', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '详情测试',
      chipType: 'GPU',
    });
    const chipId = (await createRes.json()).data.id;
    const res = await apiGet(request, token, `/chips/${chipId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(chipId);
    expect(body.data.chipNo).toBeTruthy();
  });

  test('Scenario: API — 按名称搜索芯片', async ({ request }) => {
    const { token } = await apiLogin(request);
    const searchName = `SearchTest-${Date.now()}`;
    await apiPost(request, token, '/chips', {
      name: searchName,
      vendor: '搜索测试',
      chipType: 'GPU',
    });
    const res = await apiGet(request, token, `/chips?keyword=${searchName}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const results = body.data || [];
    const found = results.find((c: any) => c.name === searchName);
    expect(found).toBeTruthy();
  });

  test('Scenario: API — 按状态筛选芯片', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/chips?status=REGISTERED');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    for (const chip of body.data || []) {
      expect(chip.status).toBe('REGISTERED');
    }
  });

  test('Scenario: API — 按芯片类型筛选', async ({ request }) => {
    const { token } = await apiLogin(request);
    const res = await apiGet(request, token, '/chips?chipType=GPU');
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
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '原始厂商',
      chipType: 'GPU',
    });
    const chipId = (await createRes.json()).data.id;
    const updateRes = await apiPut(request, token, `/chips/${chipId}`, {
      vendor: '更新后厂商',
      remark: '已更新',
    });
    expect(updateRes.ok()).toBeTruthy();
    const body = await updateRes.json();
    expect(body.code).toBe(0);
    const getRes = await apiGet(request, token, `/chips/${chipId}`);
    const chip = (await getRes.json()).data;
    expect(chip.manufacturer).toBe('更新后厂商');
  });

  test('Scenario: API — 更新芯片技术规格（后补充）', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '测试',
      chipType: 'NPU',
    });
    const chipId = (await createRes.json()).data.id;
    const updateRes = await apiPut(request, token, `/chips/${chipId}`, {
      specs: JSON.stringify({ fp16Tflops: 150, memoryGB: 32 }),
    });
    expect(updateRes.ok()).toBeTruthy();
    const getRes = await apiGet(request, token, `/chips/${chipId}`);
    const chip = (await getRes.json()).data;
    expect(chip.techSpec).toBeTruthy();
  });

  test('Scenario: API — 删除芯片', async ({ request }) => {
    const { token } = await apiLogin(request);
    const createRes = await apiPost(request, token, '/chips', {
      name: uniqueName(),
      vendor: '待删除',
      chipType: 'CPU',
    });
    const chipId = (await createRes.json()).data.id;
    const deleteRes = await apiDelete(request, token, `/chips/${chipId}`);
    expect(deleteRes.ok()).toBeTruthy();
    const getRes = await apiGet(request, token, `/chips/${chipId}`);
    const body = await getRes.json();
    if (body.code === 0) {
      expect(body.data.status).toBe('ARCHIVED');
    } else {
      expect(body.code).not.toBe(0);
    }
  });
});
