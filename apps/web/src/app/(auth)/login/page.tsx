/**
 * Login Page
 * 
 * Authentication entry point
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { setAccessToken } from '@/lib/api/client';
import { useSessionStore } from '@/lib/state/stores/session';
import { authApi } from '@/lib/api/endpoints';

export default function LoginPage() {
  const router = useRouter();
  const login = useSessionStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(email, password),
    onSuccess: (data) => {
      setAccessToken(data.access_token);
      login(data.user, data.user.tenant_id ? { id: data.user.tenant_id, name: '', slug: '', plan: 'trial', max_agents: 10, is_active: true, settings: {}, created_at: '' } : null as any);
      router.push('/leads');
    },
    onError: (err: any) => {
      setError(err?.message || 'Login failed. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text">PropAgent</h1>
          <p className="text-muted mt-1">Real Estate Sales Intelligence</p>
        </div>

        {/* Login Form */}
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error */}
            {error && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="btn-primary w-full"
            >
              {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-muted text-sm mt-6">
          Don&apos;t have an account?{' '}
          <a href="/auth/bootstrap" className="text-primary hover:underline">
            Get started
          </a>
        </p>
      </div>
    </div>
  );
}
