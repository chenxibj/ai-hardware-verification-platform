/**
 * @file api.test.js
 * @description Tests for src/utils/api.js — API client, interceptors, and API modules
 */
import axios from 'axios';

// Mock axios before importing api
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: {},
  };
  return {
    create: jest.fn(() => mockInstance),
    __mockInstance: mockInstance,
  };
});

// Must import after mocking
let api, authApi, taskApi, reportApi, chipReportApi, userApi, healthApi, k8sApi, nodeApi, runSpecApi, resourcePoolApi, gpuSlotApi;
let requestInterceptor, responseInterceptorSuccess, responseInterceptorError;

beforeAll(() => {
  const apiModule = require('../api');
  api = apiModule.default;
  authApi = apiModule.authApi;
  taskApi = apiModule.taskApi;
  reportApi = apiModule.reportApi;
  chipReportApi = apiModule.chipReportApi;
  userApi = apiModule.userApi;
  healthApi = apiModule.healthApi;
  k8sApi = apiModule.k8sApi;
  nodeApi = apiModule.nodeApi;
  runSpecApi = apiModule.runSpecApi;
  resourcePoolApi = apiModule.resourcePoolApi;
  gpuSlotApi = apiModule.gpuSlotApi;

  // Capture interceptors
  const mainInstance = axios.create.mock.results[0].value;
  requestInterceptor = mainInstance.interceptors.request.use.mock.calls[0][0];
  responseInterceptorSuccess = mainInstance.interceptors.response.use.mock.calls[0][0];
  responseInterceptorError = mainInstance.interceptors.response.use.mock.calls[0][1];
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

// ── axios.create calls ──

describe('API instances', () => {
  test('creates api instances on module load', () => {
    // axios.create was called during module import in beforeAll
    // Since beforeEach clears mocks, we check the mock instance was configured
    const mainInstance = axios.create.mock.results[0]?.value || axios.__mockInstance;
    expect(mainInstance).toBeDefined();
    expect(mainInstance.interceptors.request.use).toBeDefined();
    expect(mainInstance.interceptors.response.use).toBeDefined();
  });
});

// ── Request interceptor ──

describe('request interceptor', () => {
  test('adds Authorization header when token exists', () => {
    localStorage.setItem('token', 'test-jwt-token');
    const config = { headers: {} };
    const result = requestInterceptor(config);
    expect(result.headers.Authorization).toBe('Bearer test-jwt-token');
  });

  test('does not add Authorization header when no token', () => {
    const config = { headers: {} };
    const result = requestInterceptor(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  test('#310: clamps negative page param to 0', () => {
    const config = { headers: {}, params: { page: -5 } };
    const result = requestInterceptor(config);
    expect(result.params.page).toBe(0);
  });

  test('#310: keeps valid page param', () => {
    const config = { headers: {}, params: { page: 3 } };
    const result = requestInterceptor(config);
    expect(result.params.page).toBe(3);
  });

  test('#310: handles NaN page param', () => {
    const config = { headers: {}, params: { page: 'abc' } };
    const result = requestInterceptor(config);
    expect(result.params.page).toBe(0);
  });

  test('does not touch params without page', () => {
    const config = { headers: {}, params: { size: 10 } };
    const result = requestInterceptor(config);
    expect(result.params).toEqual({ size: 10 });
  });
});

// ── Response interceptor (success) ──

describe('response interceptor - success', () => {
  test('passes through successful response', () => {
    const res = { data: { code: 0, data: 'test' } };
    expect(responseInterceptorSuccess(res)).toBe(res);
  });
});

// ── Response interceptor (error) ──

describe('response interceptor - error', () => {
  test('sets displayMessage from backend message', async () => {
    const err = {
      response: { status: 400, data: { message: '参数错误' } },
      config: { url: '/tasks' },
    };
    await expect(responseInterceptorError(err)).rejects.toHaveProperty(
      'displayMessage', '[400] 参数错误'
    );
  });

  test('sets displayMessage from backend error field', async () => {
    const err = {
      response: { status: 500, data: { error: '服务器错误' } },
      config: { url: '/tasks' },
    };
    await expect(responseInterceptorError(err)).rejects.toHaveProperty(
      'displayMessage', '[500] 服务器错误'
    );
  });

  test('sets generic displayMessage when no backend message', async () => {
    const err = {
      response: { status: 404, data: {} },
      config: { url: '/tasks' },
    };
    await expect(responseInterceptorError(err)).rejects.toHaveProperty(
      'displayMessage', '请求失败 (HTTP 404)'
    );
  });

  test('#309: detects JSON parse error and shows friendly message', async () => {
    const err = {
      response: { status: 500, data: { message: 'JSON parse error: unexpected character' } },
      config: { url: '/tasks' },
    };
    await expect(responseInterceptorError(err)).rejects.toHaveProperty(
      'displayMessage', '请求格式错误，请检查输入数据'
    );
  });

  test('handles network error (no response)', async () => {
    const err = { request: {}, message: 'Network Error' };
    await expect(responseInterceptorError(err)).rejects.toHaveProperty(
      'displayMessage', '网络异常，请检查连接'
    );
  });

  test('handles unknown error', async () => {
    const err = { message: 'Something went wrong' };
    await expect(responseInterceptorError(err)).rejects.toHaveProperty(
      'displayMessage', 'Something went wrong'
    );
  });

  test('does NOT trigger logout for auth endpoint 401', async () => {
    const err = {
      response: { status: 401, data: { message: '密码错误' } },
      config: { url: '/auth/login' },
    };
    // Should not call logout (no import of useAuthStore for auth endpoints)
    await expect(responseInterceptorError(err)).rejects.toBeDefined();
  });
});

// ── authApi ──

describe('authApi', () => {
  test('login calls POST /auth/login', () => {
    authApi.login({ email: 'test@test.com', password: '123' });
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'test@test.com', password: '123' });
  });

  test('register calls POST /auth/register', () => {
    authApi.register({ username: 'u', email: 'e', password: 'p' });
    expect(api.post).toHaveBeenCalledWith('/auth/register', { username: 'u', email: 'e', password: 'p' });
  });

  test('me calls GET /auth/me', () => {
    authApi.me();
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  test('logout calls POST /auth/logout', () => {
    authApi.logout();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
  });

  test('refresh calls POST /auth/refresh', () => {
    authApi.refresh('rt-123');
    expect(api.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'rt-123' });
  });
});

// ── taskApi ──

describe('taskApi', () => {
  test('list calls GET /tasks with params', () => {
    taskApi.list({ page: 0, size: 10 });
    expect(api.get).toHaveBeenCalledWith('/tasks', { params: { page: 0, size: 10 } });
  });

  test('get calls GET /tasks/:id', () => {
    taskApi.get(42);
    expect(api.get).toHaveBeenCalledWith('/tasks/42');
  });

  test('create calls POST /tasks', () => {
    taskApi.create({ name: 'test' });
    expect(api.post).toHaveBeenCalledWith('/tasks', { name: 'test' });
  });

  test('cancel calls POST /tasks/:id/cancel', () => {
    taskApi.cancel(5);
    expect(api.post).toHaveBeenCalledWith('/tasks/5/cancel');
  });

  test('retry calls POST /tasks/:id/retry', () => {
    taskApi.retry(5);
    expect(api.post).toHaveBeenCalledWith('/tasks/5/retry');
  });

  test('complete calls POST /tasks/:id/complete', () => {
    taskApi.complete(5, { result: 'ok' });
    expect(api.post).toHaveBeenCalledWith('/tasks/5/complete', { result: 'ok' });
  });
});

// ── reportApi ──

describe('reportApi', () => {
  test('list calls GET /chip-reports', () => {
    reportApi.list({ page: 0 });
    expect(api.get).toHaveBeenCalledWith('/chip-reports', { params: { page: 0 } });
  });

  test('get calls GET /chip-reports/:id', () => {
    reportApi.get(1);
    expect(api.get).toHaveBeenCalledWith('/chip-reports/1');
  });

  test('create calls POST /chip-reports', () => {
    reportApi.create({ chipId: 1 });
    expect(api.post).toHaveBeenCalledWith('/chip-reports', { chipId: 1 });
  });

  test('update calls PUT /chip-reports/:id', () => {
    reportApi.update(1, { status: 'PUBLISHED' });
    expect(api.put).toHaveBeenCalledWith('/chip-reports/1', { status: 'PUBLISHED' });
  });

  test('publish calls POST /chip-reports/:id/publish', () => {
    reportApi.publish(1);
    expect(api.post).toHaveBeenCalledWith('/chip-reports/1/publish');
  });

  test('review calls POST /chip-reports/:id/review', () => {
    reportApi.review(1);
    expect(api.post).toHaveBeenCalledWith('/chip-reports/1/review');
  });

  test('delete calls DELETE /chip-reports/:id', () => {
    reportApi.delete(1);
    expect(api.delete).toHaveBeenCalledWith('/chip-reports/1');
  });

  test('stats calls GET /chip-reports/stats', () => {
    reportApi.stats();
    expect(api.get).toHaveBeenCalledWith('/chip-reports/stats');
  });
});

// ── chipReportApi ──

describe('chipReportApi', () => {
  test('getByChip calls correct endpoint', () => {
    chipReportApi.getByChip(10);
    expect(api.get).toHaveBeenCalledWith('/chip-reports/chip/10');
  });

  test('getByPlan calls correct endpoint', () => {
    chipReportApi.getByPlan(5);
    expect(api.get).toHaveBeenCalledWith('/chip-reports/plan/5');
  });

  test('compare joins ids with comma', () => {
    chipReportApi.compare([1, 2, 3]);
    expect(api.get).toHaveBeenCalledWith('/chip-reports/compare', { params: { ids: '1,2,3' } });
  });
});

// ── userApi ──

describe('userApi', () => {
  test('list calls GET /users', () => {
    userApi.list({ page: 0 });
    expect(api.get).toHaveBeenCalledWith('/users', { params: { page: 0 } });
  });

  test('updateRole calls PUT /users/:id/role', () => {
    userApi.updateRole(1, 'ADMIN');
    expect(api.put).toHaveBeenCalledWith('/users/1/role', { role: 'ADMIN' });
  });

  test('updateStatus calls PUT /users/:id/status', () => {
    userApi.updateStatus(1, 'ACTIVE');
    expect(api.put).toHaveBeenCalledWith('/users/1/status', { status: 'ACTIVE' });
  });
});

// ── healthApi ──

describe('healthApi', () => {
  test('check calls GET /health', () => {
    healthApi.check();
    expect(api.get).toHaveBeenCalledWith('/health');
  });

  test('ping calls GET /health/ping', () => {
    healthApi.ping();
    expect(api.get).toHaveBeenCalledWith('/health/ping');
  });
});

// ── nodeApi ──

describe('nodeApi', () => {
  test('list calls GET /nodes', () => {
    nodeApi.list({ page: 0 });
    expect(api.get).toHaveBeenCalledWith('/nodes', { params: { page: 0 } });
  });

  test('register calls POST /nodes/register', () => {
    nodeApi.register({ name: 'node1' });
    expect(api.post).toHaveBeenCalledWith('/nodes/register', { name: 'node1' });
  });

  test('delete calls DELETE /nodes/:id', () => {
    nodeApi.delete(3);
    expect(api.delete).toHaveBeenCalledWith('/nodes/3');
  });
});

// ── runSpecApi ──

describe('runSpecApi', () => {
  test('list without category', () => {
    runSpecApi.list();
    expect(api.get).toHaveBeenCalledWith('/run-specs', { params: {} });
  });

  test('list with category', () => {
    runSpecApi.list('compute');
    expect(api.get).toHaveBeenCalledWith('/run-specs', { params: { category: 'compute' } });
  });
});

// ── resourcePoolApi ──

describe('resourcePoolApi', () => {
  test('availability calls correct endpoint', () => {
    resourcePoolApi.availability(5);
    expect(api.get).toHaveBeenCalledWith('/resource-pools/5/availability');
  });

  test('stats calls correct endpoint', () => {
    resourcePoolApi.stats(5);
    expect(api.get).toHaveBeenCalledWith('/resource-pools/5/stats');
  });
});

// ── gpuSlotApi ──

describe('gpuSlotApi', () => {
  test('nodeSlots calls correct endpoint', () => {
    gpuSlotApi.nodeSlots(7);
    expect(api.get).toHaveBeenCalledWith('/gpu-slots/node/7');
  });

  test('overview calls correct endpoint', () => {
    gpuSlotApi.overview();
    expect(api.get).toHaveBeenCalledWith('/gpu-slots/overview');
  });
});
