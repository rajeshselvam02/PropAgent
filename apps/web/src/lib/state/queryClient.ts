/**
 * TanStack Query Client Setup
 * 
 * Configured for PropAgent API with:
 * - Stale time for better UX
 * - Retry logic for transient failures
 * - Error handling
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fresh for 30 seconds
      staleTime: 30 * 1000,
      // Keep unused data for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Retry failed requests
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (except 401 which is handled by client)
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // Retry up to 3 times for 5xx errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Retry mutations once for network errors
      retry: (failureCount, error: any) => {
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

/**
 * Query key factory for type-safe query keys
 */
export const queryKeys = {
  // Auth
  me: ['me'] as const,
  
  // Leads
  leads: (filters?: Record<string, any>) => ['leads', filters] as const,
  lead: (id: string) => ['lead', id] as const,
  
  // Follow-ups
  overdueFollowUps: () => ['follow-ups', 'overdue'] as const,
  
  // Analytics
  analyticsSummary: (params?: Record<string, any>) => ['analytics', 'summary', params] as const,
  analyticsFunnel: (params?: Record<string, any>) => ['analytics', 'funnel', params] as const,
  analyticsAgentPerformance: (params?: Record<string, any>) => ['analytics', 'agent-performance', params] as const,
  analyticsSourceROI: (params?: Record<string, any>) => ['analytics', 'source-roi', params] as const,
  analyticsTimeToConversion: (params?: Record<string, any>) => ['analytics', 'time-to-conversion', params] as const,
  analyticsTeamMetrics: (params?: Record<string, any>) => ['analytics', 'team-metrics', params] as const,
  
  // Team
  team: () => ['team'] as const,
  user: (id: string) => ['user', id] as const,
  
  // Agents
  agents: () => ['agents'] as const,
  agent: (id: string) => ['agent', id] as const,
  
  // Projects
  projects: () => ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  
  // Billing
  plans: () => ['plans'] as const,
  tenantPlan: () => ['tenant', 'plan'] as const,
} as const;

/**
 * Helper to invalidate all queries (useful after logout)
 */
export function invalidateAllQueries() {
  return queryClient.invalidateQueries();
}

/**
 * Helper to invalidate leads queries (useful after lead mutations)
 */
export function invalidateLeadsQueries() {
  return queryClient.invalidateQueries({ queryKey: ['leads'] });
}

/**
 * Helper to invalidate analytics queries
 */
export function invalidateAnalyticsQueries() {
  return queryClient.invalidateQueries({ queryKey: ['analytics'] });
}
