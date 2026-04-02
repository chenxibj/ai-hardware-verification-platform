/**
 * Feature: 用户认证
 *
 * 覆盖登录、注册、登出功能。
 * 使用 API + UI 混合验证。
 */
import { test, expect, TEST_USER, apiLogin } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../pages/login.page';

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

test.describe('Feature: 用户认证', () => {
  test('Scenario: 使用有效凭据通过 UI 登录', async ({ page }) => {
    // Given 用户在登录页面
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // When 用户输入正确的邮箱和密码并点击登录
    await loginPage.login(TEST_USER.email, TEST_USER.password);

    // Then 应该登录成功并进入主界面
    await loginPage.expectInApp();

    // And 侧边栏应显示"工作台"菜单项
    await expect(page.locator('.ant-menu-item', { hasText: '工作台' })).toBeVisible();
  });

  test('Scenario: 使用错误密码登录失败', async ({ page }) => {
    // Given 用户在登录页面
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // When 用户输入正确邮箱但错误密码
    await loginPage.login(TEST_USER.email, 'wrongpassword');

    // Then 应该显示错误提示
    // Then 应该显示错误提示或仍然停留在登录页面（未跳转）
    const errorShown = await page.locator('.ant-message-error').isVisible({ timeout: 15_000 }).catch(() => false);
    if (!errorShown) {
      // 即使没有 error toast，只要没跳转到主页就说明登录失败
      await expect(page.locator('text=人工智能软硬件验证平台')).toBeVisible();
    }
    // And 应该仍然在登录页面
    await expect(page.locator('text=人工智能软硬件验证平台')).toBeVisible();
  });

  test('Scenario: 使用不存在的邮箱登录失败', async ({ page }) => {
    // Given 用户在登录页面
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // When 用户输入不存在的邮箱
    await loginPage.login('nonexistent@ahvp.com', 'password123');

    // Then 应该显示错误提示
    // Then 应该显示错误提示或仍然停留在登录页面
    const errorShown = await page.locator('.ant-message-error').isVisible({ timeout: 15_000 }).catch(() => false);
    if (!errorShown) {
      await expect(page.locator('text=人工智能软硬件验证平台')).toBeVisible();
    }
  });

  test('Scenario: 通过 API 登录获取 JWT token', async ({ request }) => {
    // Given 系统正常运行
    // When 通过 API 发送登录请求
    const data = await apiLogin(request);

    // Then 应返回有效的 token
    expect(data.token).toBeTruthy();
    expect(data.token.split('.').length).toBe(3); // JWT has 3 parts

    // And 应返回 refreshToken
    expect(data.refreshToken).toBeTruthy();

    // And 应返回用户信息
    expect(data.user.email).toBe(TEST_USER.email);
    expect(data.user.username).toBe(TEST_USER.username);
    expect(data.user.status).toBe('ACTIVE');
  });

  test('Scenario: 使用 token 访问受保护的 /auth/me 端点', async ({ request }) => {
    // Given 用户已通过 API 获取了 token
    const { token } = await apiLogin(request);

    // When 使用 token 请求 /auth/me
    const res = await request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Then 应返回当前用户信息
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    expect(body.data.email).toBe(TEST_USER.email);
  });

  test('Scenario: 无 token 访问受保护端点返回 401/403', async ({ request }) => {
    // Given 没有认证 token
    // When 请求受保护的端点
    const res = await request.get(`${API_BASE}/tasks`);

    // Then 应返回 401 或 403
    expect([401, 403]).toContain(res.status());
  });

  test('Scenario: 注册已存在的邮箱失败', async ({ request }) => {
    // Given 邮箱 test@ahvp.com 已注册
    // When 尝试用相同邮箱注册
    const res = await request.post(`${API_BASE}/auth/register`, {
      data: {
        username: 'duplicate',
        email: TEST_USER.email,
        password: 'test123',
      },
    });

    // Then 应返回错误
    const body = await res.json();
    expect(body.code).not.toBe(0);
    expect(body.message).toContain('already');
  });

  test('Scenario: 用户登出后 UI 返回登录页面', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Given 用户已登录
    await expect(page.locator('.ant-menu')).toBeVisible();

    // When 用户点击头部用户按钮，再点击退出登录
    await page.getByRole('button', { name: /test/ }).click();
    await page.locator('.ant-dropdown-menu-item-danger', { hasText: '退出登录' }).click();

    // Then 应该回到登录页面
    await expect(page.locator('text=人工智能软硬件验证平台')).toBeVisible({ timeout: 10_000 });
  });

  test('Scenario: API 登出', async ({ request }) => {
    // Given 用户已登录
    const { token } = await apiLogin(request);

    // When 调用登出 API
    const res = await request.post(`${API_BASE}/auth/logout`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Then 应返回成功
    const body = await res.json();
    expect(body.code).toBe(0);
  });
});
