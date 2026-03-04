/**
 * API Endpoints
 * 
 * Centralized endpoint definitions with typed request/response
 */

import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type {
  Lead,
  LeadFilters,
  LeadCreateRequest,
  LeadUpdateStatusRequest,
  LeadContactedRequest,
  LeadAssignRequest,
  LeadFollowUpRequest,
  Interaction,
  Agent,
  Project,
  User,
  UserInviteRequest,
  UserUpdateRequest,
  Session,
  FunnelData,
  AgentPerformance,
  SourceROI,
  AnalyticsSummary,
  Plan,
  Subscription,
  UsageCounters,
} from '@/types/entities';
import type {
  LeadsListResponse,
  LeadGetResponse,
  LeadCreateResponse,
  LeadAssignResponse,
  LeadScoreResponse,
  OverdueFollowUpsResponse,
  FunnelResponse,
  AgentPerformanceResponse,
  SourceROIResponse,
  TimeToConversionResponse,
  SummaryResponse,
  TeamMetricsResponse,
  PlansResponse,
  TenantPlanResponse,
  CheckoutResponse,
  LimitCheckResponse,
  UsersListResponse,
  UserInviteResponse,
  AnalyticsParams,
} from '@/types/api';

// =============================================================================
// AUTH ENDPOINTS
// =============================================================================

export const authApi = {
  login: (email: string, password: string, tenant_slug?: string) =>
    apiPost<Session>('/auth/login', { email, password, tenant_slug }),

  logout: () =>
    apiPost<void>('/auth/logout'),

  me: () =>
    apiGet<User>('/auth/me'),

  refresh: () =>
    apiPost<{ access_token: string }>('/auth/refresh'),

  bootstrap: (data: { name: string; email: string; password: string; tenant_name: string }) =>
    apiPost<{ tenant: any; user: User }>('/auth/bootstrap', data),
};

// =============================================================================
// LEADS ENDPOINTS
// =============================================================================

export const leadsApi = {
  list: (filters?: LeadFilters) =>
    apiGet<LeadsListResponse>('/api/leads', filters),

  get: (id: string) =>
    apiGet<LeadGetResponse>(`/api/leads/${id}`),

  create: (data: LeadCreateRequest) =>
    apiPost<LeadCreateResponse>('/api/leads', data),

  contacted: (id: string, data?: LeadContactedRequest) =>
    apiPut<Lead>(`/api/leads/${id}/contacted`, data),

  updateStatus: (id: string, data: LeadUpdateStatusRequest) =>
    apiPut<Lead>(`/api/leads/${id}/status`, data),

  assign: (id: string, data?: LeadAssignRequest) =>
    apiPost<LeadAssignResponse>(`/api/leads/${id}/assign`, data),

  scheduleFollowUp: (id: string, data: LeadFollowUpRequest) =>
    apiPost<Lead>(`/api/leads/${id}/follow-up`, data),

  calculateScore: (id: string) =>
    apiPost<LeadScoreResponse>(`/api/leads/${id}/calculate-score`),
};

// =============================================================================
// FOLLOW-UPS ENDPOINTS
// =============================================================================

export const followUpsApi = {
  overdue: () =>
    apiGet<OverdueFollowUpsResponse>('/api/follow-ups/overdue'),
};

// =============================================================================
// ANALYTICS ENDPOINTS
// =============================================================================

export const analyticsApi = {
  summary: (params?: AnalyticsParams) =>
    apiGet<SummaryResponse>('/api/analytics/summary', params),

  funnel: (params?: AnalyticsParams) =>
    apiGet<FunnelResponse>('/api/analytics/funnel', params),

  agentPerformance: (params?: AnalyticsParams) =>
    apiGet<AgentPerformanceResponse>('/api/analytics/agent-performance', params),

  sourceROI: (params?: AnalyticsParams) =>
    apiGet<SourceROIResponse>('/api/analytics/source-roi', params),

  timeToConversion: (params?: AnalyticsParams) =>
    apiGet<TimeToConversionResponse>('/api/analytics/time-to-conversion', params),

  teamMetrics: (params?: AnalyticsParams & { teamId?: string }) =>
    apiGet<TeamMetricsResponse>('/api/analytics/team-metrics', params),
};

// =============================================================================
// BILLING ENDPOINTS
// =============================================================================

export const billingApi = {
  plans: () =>
    apiGet<PlansResponse>('/plans'),

  tenantPlan: () =>
    apiGet<TenantPlanResponse>('/auth/tenant/plan'),

  checkout: (planId: string) =>
    apiPost<CheckoutResponse>('/auth/tenant/checkout', { plan_id: planId }),

  checkLimit: (action: 'leads' | 'whatsapp' | 'storage', quantity?: number) =>
    apiPost<LimitCheckResponse>('/auth/tenant/check-limit', { action, quantity }),
};

// =============================================================================
// TEAM ENDPOINTS
// =============================================================================

export const teamApi = {
  list: () =>
    apiGet<UsersListResponse>('/auth/team'),

  invite: (data: UserInviteRequest) =>
    apiPost<UserInviteResponse>('/auth/team/invite', data),

  update: (id: string, data: UserUpdateRequest) =>
    apiPut<User>(`/auth/team/${id}`, data),

  disable: (id: string) =>
    apiPut<User>(`/auth/team/${id}`, { is_active: false }),

  enable: (id: string) =>
    apiPut<User>(`/auth/team/${id}`, { is_active: true }),
};

// =============================================================================
// AGENTS ENDPOINTS
// =============================================================================

export const agentsApi = {
  list: () =>
    apiGet<Agent[]>('/api/agents'),

  get: (id: string) =>
    apiGet<Agent>(`/api/agents/${id}`),
};

// =============================================================================
// PROJECTS ENDPOINTS
// =============================================================================

export const projectsApi = {
  list: () =>
    apiGet<Project[]>('/api/projects'),

  get: (id: string) =>
    apiGet<Project>(`/api/projects/${id}`),
};

// =============================================================================
// WEBHOOK ENDPOINTS (for testing)
// =============================================================================

export const webhookApi = {
  stripe: (event: any) =>
    apiPost<void>('/webhook/stripe', event),
};
