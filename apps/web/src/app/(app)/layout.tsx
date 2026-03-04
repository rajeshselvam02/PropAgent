/**
 * App Layout
 * 
 * Protected layout that requires authentication
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/lib/state/stores/session';
import { authApi } from '@/lib/api/endpoints';
import { setAccessToken } from '@/lib/api/client';
import { AppShell } from '@/components/layout/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const setLoading = useSessionStore((state) => state.setLoading);
  const login = useSessionStore((state) => state.login);
  const isLoading = useSessionStore((state) => state.isLoading);
  const [isChecking, setIsChecking] = useState(true);

  // Check session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const user = await authApi.me();
        login(user, user.tenant_id ? { id: user.tenant_id, name: '', slug: '', plan: 'trial', max_agents: 10, is_active: true, settings: {}, created_at: '' } : null as any);
      } catch {
        // Not authenticated, redirect to login
        setLoading(false);
        router.replace('/login');
      } finally {
        setIsChecking(false);
      }
    }

    // If we have a stored session, verify it
    if (isAuthenticated) {
      setIsChecking(false);
    } else {
      checkSession();
    }
  }, [isAuthenticated, router, login, setLoading]);

  // Show loading state while checking
  if (isChecking || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated - show app
  return <AppShell>{children}</AppShell>;
}
