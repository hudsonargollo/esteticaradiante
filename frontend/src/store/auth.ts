import { create } from 'zustand';
import api from '@/lib/api';
import type { User, Tenant } from '@/lib/types';

interface AuthState {
  user: User | null;
  token: string | null;
  tenant: Tenant | null;
  loading: boolean;
  needsSetup: boolean;

  login: (email: string, password: string) => Promise<void>;
  setup: (data: { name: string; email: string; password: string; business_name: string }) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  tenant: null,
  loading: true,
  needsSetup: false,

  login: async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('tenant', JSON.stringify(data.tenants[0]));
    set({ user: data.user, token: data.access_token, tenant: data.tenants[0] });
  },

  setup: async (payload) => {
    const { data } = await api.post('/auth/setup/initialize', payload);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('tenant', JSON.stringify(data.tenants[0]));
    set({ user: data.user, token: data.access_token, tenant: data.tenants[0], needsSetup: false });
  },

  logout: () => {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('token');
    localStorage.removeItem('tenant');
    set({ user: null, token: null, tenant: null });
  },

  loadFromStorage: async () => {
    if (typeof window === 'undefined') {
      set({ loading: false });
      return;
    }

    try {
      const { data: setupStatus } = await api.get('/auth/setup/status');
      if (setupStatus.needsSetup) {
        set({ loading: false, needsSetup: true });
        return;
      }
    } catch {
      // backend not reachable yet — fall through to normal auth check
    }

    const token = localStorage.getItem('token');
    const tenantStr = localStorage.getItem('tenant');
    const tenant = tenantStr ? JSON.parse(tenantStr) : null;

    if (!token) {
      set({ loading: false });
      return;
    }

    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, token, tenant: tenant || data.tenants[0], loading: false });
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('tenant');
      set({ loading: false });
    }
  },
}));
