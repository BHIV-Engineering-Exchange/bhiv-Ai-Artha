import { create } from 'zustand';
import api from '../services/api';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setLoading: (loading) => set({ isLoading: loading }),

  checkAuth: async () => {
    try {
      const response = await api.get('/auth/me');
      set({
        user: response.data?.data || null,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
    window.location.href = '/login';
  },

  updateUser: (userData) => {
    set((state) => ({
      user: { ...state.user, ...userData },
    }));
  },
}));
