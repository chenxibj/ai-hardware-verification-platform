import { test as base, expect, Page, APIRequestContext } from '@playwright/test';

/** Credentials for the test user */
export const TEST_USER = {
  email: 'test@ahvp.com',
  password: 'Test1234',
  username: "testuser",
};

/** API base (backend direct, not via frontend proxy) */
const API_BASE = process.env.API_BASE || 'http://localhost:8080/api';

/**
 * Helper: login via API and return token + user object.
 */
export async function apiLogin(
  request: APIRequestContext,
  email = TEST_USER.email,
  password = TEST_USER.password,
): Promise<{ token: string; refreshToken: string; user: Record<string, any> }> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok(), `Login API should return 200, got ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.code).toBe(0);
  return body.data;
}

/**
 * Helper: perform authenticated API request.
 */
export async function apiGet(request: APIRequestContext, token: string, path: string) {
  const res = await request.get(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res;
}

export async function apiPost(
  request: APIRequestContext,
  token: string,
  path: string,
  data?: Record<string, any>,
) {
  const res = await request.post(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res;
}

export async function apiDelete(request: APIRequestContext, token: string, path: string) {
  const res = await request.delete(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res;
}

export async function apiPut(
  request: APIRequestContext,
  token: string,
  path: string,
  data?: Record<string, any>,
) {
  const res = await request.put(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res;
}

/**
 * Helper: login via UI (fills in the Login page and submits).
 * After success the page should show the main layout.
 */
export async function uiLogin(page: Page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto('/');
  // Wait for login page to be visible
  await expect(page.locator('text=欢迎登录')).toBeVisible({ timeout: 15_000 });

  // Fill in email & password
  await page.getByPlaceholder('邮箱').fill(email);
  await page.getByPlaceholder('密码').fill(password);

  // Click login button
  await page.getByRole('button', { name: '登 录' }).click();

  // Wait for successful redirect — sidebar should contain "工作台"
  await expect(page.locator('.ant-menu')).toBeVisible({ timeout: 15_000 });
}

/**
 * Poll a task until it reaches a terminal state (COMPLETED / FAILED / CANCELLED).
 * Returns the final task data.
 */
export async function pollTaskUntilDone(
  request: APIRequestContext,
  token: string,
  taskId: number,
  timeoutMs = 60_000,
  intervalMs = 2_000,
): Promise<Record<string, any>> {
  const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'TERMINATED'];
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const res = await apiGet(request, token, `/tasks/${taskId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.code).toBe(0);
    const task = body.data;

    if (TERMINAL.includes(task.status)) {
      return task;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Task ${taskId} did not reach terminal state within ${timeoutMs}ms`);
}

// ---- Custom fixtures ----

type AuthFixtures = {
  /** A Page already logged in via UI */
  authenticatedPage: Page;
  /** A valid JWT token obtained via API */
  authToken: string;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await uiLogin(page);
    await use(page);
  },

  authToken: async ({ request }, use) => {
    const { token } = await apiLogin(request);
    await use(token);
  },
});

export { expect };
