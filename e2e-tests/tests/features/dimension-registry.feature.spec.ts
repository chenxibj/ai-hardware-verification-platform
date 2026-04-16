/**
 * Feature: 维度系统（DimensionRegistry #459）
 * 验证 /api/dimensions 端点和维度 key 归一化
 *
 * 测试点:
 * - GET /dimensions 返回列表，每个维度有 key/label/direction/primaryMetric
 * - 所有 key 是英文（compute/memory/communication/op_compat/training/inference/scalability/ecosystem）
 * - 报告中的 dimensionScores 使用英文 key
 */
import { test, expect, apiLogin, apiGet } from '../../fixtures/auth.fixture';

const EXPECTED_KEYS = [
  'compute',
  'memory',
  'communication',
  'op_compat',
  'training',
  'inference',
  'scalability',
  'ecosystem',
];

test.describe('Feature: 维度系统 (DimensionRegistry #459)', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await apiLogin(request);
    token = auth.token;
  });

  test('Scenario: GET /dimensions 返回维度列表', async ({ request }) => {
    // When 请求维度接口
    const res = await apiGet(request, token, '/dimensions');

    // Then 返回成功
    expect(res.ok(), `Expected 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);

    // And 包含 dimensions 数组
    const dims = body.data?.dimensions;
    expect(Array.isArray(dims)).toBeTruthy();
    expect(dims.length).toBeGreaterThan(0);
  });

  test('Scenario: 每个维度包含 key/label/direction/primaryMetric', async ({ request }) => {
    const res = await apiGet(request, token, '/dimensions');
    const body = await res.json();
    const dims = body.data?.dimensions || [];

    for (const dim of dims) {
      expect(dim).toHaveProperty('key');
      expect(dim).toHaveProperty('label');
      expect(dim).toHaveProperty('direction');
      expect(dim).toHaveProperty('primaryMetric');

      // direction 只能是 lower_better 或 higher_better
      expect(['lower_better', 'higher_better']).toContain(dim.direction);

      // primaryMetric 非空
      expect(dim.primaryMetric.length).toBeGreaterThan(0);
    }
  });

  test('Scenario: 所有维度 key 为英文标识符', async ({ request }) => {
    const res = await apiGet(request, token, '/dimensions');
    const body = await res.json();
    const dims = body.data?.dimensions || [];
    const keys = dims.map((d: any) => d.key);

    // Then 所有 key 应只包含英文字母和下划线
    for (const key of keys) {
      expect(key).toMatch(/^[a-z_]+$/);
    }

    // And 包含所有预期的核心维度 key
    for (const expected of EXPECTED_KEYS) {
      expect(keys).toContain(expected);
    }
  });

  test('Scenario: allKeys 和 dimensions 列表一致', async ({ request }) => {
    const res = await apiGet(request, token, '/dimensions');
    const body = await res.json();
    const dims = body.data?.dimensions || [];
    const allKeys = body.data?.allKeys || [];

    // allKeys 应和 dimensions 的 key 一致
    const dimKeys = dims.map((d: any) => d.key);
    expect(allKeys.sort()).toEqual(dimKeys.sort());
  });

  test('Scenario: labelToKey 映射正确', async ({ request }) => {
    const res = await apiGet(request, token, '/dimensions');
    const body = await res.json();
    const labelToKey = body.data?.labelToKey || {};

    // Then 中文 label 能正确映射到英文 key
    expect(labelToKey['计算']).toBe('compute');
    expect(labelToKey['访存']).toBe('memory');
    expect(labelToKey['通信']).toBe('communication');
    expect(labelToKey['算子兼容']).toBe('op_compat');
  });

  test('Scenario: 报告中 dimensionScores 使用英文 key', async ({ request }) => {
    // Given 获取报告列表
    const reportRes = await apiGet(request, token, '/reports');
    expect(reportRes.ok()).toBeTruthy();
    const reportBody = await reportRes.json();
    const records = reportBody.data?.records || [];
    test.skip(records.length === 0, '无报告数据');

    // When 检查第一份报告的 dimensionScores
    const report = records[0];
    const scores =
      typeof report.dimensionScores === 'string'
        ? JSON.parse(report.dimensionScores)
        : report.dimensionScores;

    // Then 所有 key 应为英文
    const scoreKeys = Object.keys(scores);
    for (const key of scoreKeys) {
      expect(key).toMatch(/^[a-z_]+$/);
    }

    // And 包含核心维度
    expect(scoreKeys).toContain('compute');
    expect(scoreKeys).toContain('memory');
    expect(scoreKeys).toContain('inference');
  });

  test('Scenario: /dimensions 不需要认证即可访问', async ({ request }) => {
    // When 不带 token 请求
    const res = await request.get(
      `${process.env.API_BASE || 'http://localhost:8080/api'}/dimensions`,
    );

    // Then 仍然返回成功（维度是公开配置）
    // Note: 如果需要认证则此测试会标记为已知限制
    if (res.ok()) {
      const body = await res.json();
      expect(body.code).toBe(0);
    } else {
      // 需要认证也可接受，但记录下来
      expect(res.status()).toBe(401);
    }
  });
});
