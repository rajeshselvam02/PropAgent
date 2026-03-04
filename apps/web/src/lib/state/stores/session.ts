/**
 * Session Store
 * 
 * Manages user session state with Zustand.
 * Handles: login state, user info, tenant, role
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Tenant } from '@/types/entities';

interface SessionState {
  // State
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setTenant: (tenant: Tenant | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  login: (user: User, tenant: Tenant) => void;
  logout: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      tenant: null,
      isAuthenticated: false,
      isLoading: true,
      
      // Actions
      setUser: (user) => set({ user }),
      setTenant: (tenant) => set({ tenant }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setLoading: (isLoading) => set({ isLoading }),
      
      login: (user, tenant) => set({
        user,
        tenant,
        isAuthenticated: true,
        isLoading: false,
      }),
      
      logout: () => set({
        user: null,
        tenant: null,
        isAuthenticated: false,
        isLoading: false,
      }),
    }),
    {
      name: 'propagent-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

/**
 * Check if user has specific role
 */
export function useHasRole(role: 'agent' | 'manager' | 'admin'): boolean {
  const user = useSessionStore((state) => state.user);
  if (!user) return false;
  if (role === 'agent') return true;
  if (role === 'manager') return user.role === 'manager' || user.role === 'admin';
  return user.role === 'admin';
}

/**
 * Check if user is manager or above
 */
export function useIsManager(): boolean {
  return useHasRole('manager');
}

/**
 * Get current user's role
 */
export function useUserRole(): string | null {
  const user = useSessionStore((state) => state.user);
  return user?.role ?? null;
}
