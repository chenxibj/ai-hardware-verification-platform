import { create } from 'zustand';
import api from '../utils/api';

const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (email, password) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.code === 0) {
        const { token, refreshToken, user } = res.data.data;
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        set({ token, user, isAuthenticated: true });
        return { success: true, user };
      }
      return { success: false, message: res.data.message };
    } catch (err) {
      // Extract error message from response (BusinessException returns HTTP 401/423)
      const msg = err.response?.data?.message || '登录失败';
      return { success: false, message: msg };
    }
  },

  register: async (username, email, password, organization, phone, role) => {
    try {
      const res = await api.post('/auth/register', { username, email, password, organization, phone, role });
      if (res.data.code === 0) {
        // Registration successful but don't auto-login, let user login manually
        return { success: true };
      }
      return { success: false, message: res.data.message };
    } catch (err) {
      const msg = err.response?.data?.message || '注册失败';
      return { success: false, message: msg };
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  updateUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },
}));

export default useAuthStore;
