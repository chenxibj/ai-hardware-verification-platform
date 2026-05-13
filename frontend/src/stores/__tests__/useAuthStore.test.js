/**
 * @file useAuthStore.test.js
 * @description Tests for src/stores/useAuthStore.js — Zustand auth store
 */
import useAuthStore from '../../stores/useAuthStore';
import api from '../../utils/api';

// Mock the api module
jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    test('defaults to unauthenticated when no token in localStorage', () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
    });
  });

  describe('login', () => {
    test('successful login sets token and user', async () => {
      const mockUser = { id: 1, username: 'test', email: 'test@example.com', role: 'ENGINEER' };
      api.post.mockResolvedValueOnce({
        data: {
          code: 0,
          data: { token: 'jwt-token', refreshToken: 'refresh-token', user: mockUser },
        },
      });

      const result = await useAuthStore.getState().login('test@example.com', 'password');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);

      const state = useAuthStore.getState();
      expect(state.token).toBe('jwt-token');
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(localStorage.getItem('token')).toBe('jwt-token');
      expect(localStorage.getItem('refreshToken')).toBe('refresh-token');
      expect(JSON.parse(localStorage.getItem('user'))).toEqual(mockUser);
    });

    test('failed login (code !== 0) returns error message', async () => {
      api.post.mockResolvedValueOnce({
        data: { code: 1, message: '邮箱或密码错误' },
      });

      const result = await useAuthStore.getState().login('test@example.com', 'wrong');

      expect(result.success).toBe(false);
      expect(result.message).toBe('邮箱或密码错误');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
    });

    test('login network error returns error message', async () => {
      api.post.mockRejectedValueOnce({
        response: { data: { message: '账户已锁定，请30分钟后重试' } },
      });

      const result = await useAuthStore.getState().login('test@example.com', 'wrong');

      expect(result.success).toBe(false);
      expect(result.message).toBe('账户已锁定，请30分钟后重试');
    });

    test('login error without response message uses default', async () => {
      api.post.mockRejectedValueOnce(new Error('Network Error'));

      const result = await useAuthStore.getState().login('test@example.com', 'password');

      expect(result.success).toBe(false);
      expect(result.message).toBe('登录失败');
    });
  });

  describe('register', () => {
    test('successful registration returns success', async () => {
      api.post.mockResolvedValueOnce({
        data: { code: 0, message: '注册成功' },
      });

      const result = await useAuthStore.getState().register(
        'newuser', 'new@example.com', 'password', 'Org', '1234567890', 'ENGINEER'
      );

      expect(result.success).toBe(true);
      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password',
        organization: 'Org',
        phone: '1234567890',
        role: 'ENGINEER',
      });

      // Should NOT auto-login
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
    });

    test('failed registration returns error message', async () => {
      api.post.mockResolvedValueOnce({
        data: { code: 1, message: '邮箱已注册' },
      });

      const result = await useAuthStore.getState().register(
        'user', 'existing@example.com', 'password', 'Org', '', 'ENGINEER'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('邮箱已注册');
    });

    test('registration network error returns error message', async () => {
      api.post.mockRejectedValueOnce({
        response: { data: { message: '服务器错误' } },
      });

      const result = await useAuthStore.getState().register(
        'user', 'test@example.com', 'password', 'Org', '', 'ENGINEER'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('服务器错误');
    });
  });

  describe('logout', () => {
    test('clears token, user, and localStorage', () => {
      // Set up authenticated state
      useAuthStore.setState({
        token: 'jwt-token',
        user: { id: 1 },
        isAuthenticated: true,
      });
      localStorage.setItem('token', 'jwt-token');
      localStorage.setItem('refreshToken', 'refresh-token');
      localStorage.setItem('user', '{"id":1}');

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('updateUser', () => {
    test('updates user in state and localStorage', () => {
      const newUser = { id: 1, username: 'updated', role: 'ADMIN' };
      useAuthStore.getState().updateUser(newUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(newUser);
      expect(JSON.parse(localStorage.getItem('user'))).toEqual(newUser);
    });
  });
});
