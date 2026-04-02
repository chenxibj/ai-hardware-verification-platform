import { create } from 'zustand';
import api from '../utils/api';

const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (email, password) => {
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
  },

  register: async (username, email, password) => {
    const res = await api.post('/auth/register', { username, email, password });
    if (res.data.code === 0) {
      const { token, refreshToken, user } = res.data.data;
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
      return { success: true, user };
    }
    return { success: false, message: res.data.message };
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
