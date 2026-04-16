/**
 * Feature: 版本追溯 (#460)
 * 验证 /api/version 和 /api/health 版本一致性
 *
 * 测试点:
 * - GET /version 返回 200，包含 gitCommit/version/buildTime
 * - GET /health 也包含 version 和 commit
 * - 不需要认证即可访问
 * - gitCommit 非空且非 "unknown"
 */
import { test, expect } from '../../fixtures/auth.fixture';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 版本追溯 (#460)', () => {
  test('Scenario: GET /version 返回版本信息', async ({ request }) => {
    // When 请求版本接口（无需认证）
    const res = await request.get(`${API_BASE}/version`);

    // Then 返回 200
    expect(res.ok(), `Expected 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();

    // And 包含必要字段
    expect(body).toHaveProperty('gitCommit');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('buildTime');
  });

  test('Scenario: gitCommit 非空且非 "unknown"', async ({ request }) => {
    const res = await request.get(`${API_BASE}/version`);
    const body = await res.json();

    // Then gitCommit 应该是有效的 commit hash
    expect(body.gitCommit).toBeTruthy();
    expect(body.gitCommit).not.toBe('unknown');
    expect(body.gitCommit.length).toBeGreaterThanOrEqual(7); // 至少是短 hash
  });

  test('Scenario: version 字段格式正确', async ({ request }) => {
    const res = await request.get(`${API_BASE}/version`);
    const body = await res.json();

    // Then version 应以 v 开头
    expect(body.version).toBeTruthy();
    expect(body.version.startsWith('v')).toBeTruthy();
  });

  test('Scenario: buildTime 是有效的时间戳', async ({ request }) => {
    const res = await request.get(`${API_BASE}/version`);
    const body = await res.json();

    // Then buildTime 应是有效的 ISO 时间
    expect(body.buildTime).toBeTruthy();
    const buildDate = new Date(body.buildTime);
    expect(buildDate.getTime()).toBeGreaterThan(0);
  });

  test('Scenario: GET /health 返回健康状态', async ({ request }) => {
    // When 请求健康检查接口（无需认证）
    const res = await request.get(`${API_BASE}/health`);

    // Then 返回 200
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // And 状态为 UP
    expect(body.data?.status || body.status).toBe('UP');
  });

  test('Scenario: /health 包含版本信息与 /version 一致', async ({ request }) => {
    // Given 获取 version 和 health 信息
    const [versionRes, healthRes] = await Promise.all([
      request.get(`${API_BASE}/version`),
      request.get(`${API_BASE}/health`),
    ]);
    const version = await versionRes.json();
    const health = await healthRes.json();
    const healthData = health.data || health;

    // Then 版本和 commit 应一致
    expect(healthData.version).toBe(version.version);
    expect(healthData.commit).toBe(version.gitCommit);
  });

  test('Scenario: /health 包含组件状态', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`);
    const body = await res.json();
    const data = body.data || body;

    // Then 应包含组件状态
    expect(data.components).toBeTruthy();

    // And 核心组件应为 UP
    expect(data.components.database).toBe('UP');
    expect(data.components.redis).toBe('UP');
  });

  test('Scenario: /version 不需要认证', async ({ request }) => {
    // When 不带任何 token 请求
    const res = await request.get(`${API_BASE}/version`);

    // Then 仍能访问
    expect(res.status()).toBe(200);
  });

  test('Scenario: /health 不需要认证', async ({ request }) => {
    // When 不带任何 token 请求
    const res = await request.get(`${API_BASE}/health`);

    // Then 仍能访问
    expect(res.status()).toBe(200);
  });
});
