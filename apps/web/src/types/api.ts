/**
 * API Types
 * 
 * Request/response types for all API endpoints
 */

import type {
  Lead,
  LeadFilters,
  Interaction,
  FollowUp,
  SiteVisit,
  Agent,
  Project,
  Session,
  User,
  FunnelData,
  AgentPerformance,
  SourceROI,
  AnalyticsSummary,
  Plan,
  Subscription,
  UsageCounters,
  ApiResponse,
} from './entities';

// =============================================================================
// AUTH API
// =============================================================================

export interface LoginRequest {
  email: string;
  password: string;
  tenant_slug?: string;
}

export interface LoginResponse extends ApiResponse<Session> {}

export interface RefreshResponse extends ApiResponse<{ access_token: string }> {}

export interface MeResponse extends ApiResponse<User> {}

// =============================================================================
// LEADS API
// =============================================================================

export interface LeadsListParams extends LeadFilters {}

export interface LeadsListResponse extends ApiResponse<Lead[]> {}

export interface LeadGetResponse extends ApiResponse<Lead> {}

export interface LeadCreateRequest {
  name: string;
  phone: string;
  email?: string;
  source?: string;
  project_interest?: string;
  tenant_id?: string;
}

export interface LeadCreateResponse extends ApiResponse<Lead> {}

export interface LeadUpdateStatusRequest {
  status: string;
  notes?: string;
  agent_id?: string;
}

export interface LeadContactedRequest {
  agent_id?: string;
  notes?: string;
}

export interface LeadAssignRequest {
  agent_id?: string; // optional, auto-assign if omitted
}

export interface LeadAssignResponse extends ApiResponse<{ agent_id: string; agent_name: string }> {}

export interface LeadFollowUpRequest {
  scheduled_at: string;
  notes?: string;
  agent_id?: string;
}

export interface LeadScoreResponse extends ApiResponse<{ intent_score: number; intent_class: string }> {}

// =============================================================================
// FOLLOW-UPS API
// =============================================================================

export interface OverdueFollowUpsResponse extends ApiResponse<Lead[]> {}

// =============================================================================
// ANALYTICS API
// =============================================================================

export interface AnalyticsParams {
  from?: string;
  to?: string;
  tenantId?: string;
  agent?: string;
  source?: string;
  groupBy?: 'source' | 'agent';
}

export interface FunnelResponse extends ApiResponse<FunnelData> {}

export interface AgentPerformanceResponse extends ApiResponse<{
  period: { from: string; to: string };
  source: 'precomputed' | 'realtime';
  leaderboard: AgentPerformance[];
}> {}

export interface SourceROIResponse extends ApiResponse<{
  period: { from: string; to: string };
  source: 'precomputed' | 'realtime';
  sources: SourceROI[];
}> {}

export interface TimeToConversionResponse extends ApiResponse<{
  period: { from: string; to: string };
  groupBy: string;
  overallAvgDays: number;
  breakdown: Array<{
    [key: string]: string | number;
    label: string;
    totalConversions: number;
    avgDays: number;
    minDays: number;
    maxDays: number;
    medianDays: number;
  }>;
}> {}

export interface SummaryResponse extends ApiResponse<AnalyticsSummary> {}

export interface TeamMetricsResponse extends ApiResponse<{
  period: { from: string; to: string };
  team: {
    size: number;
    totalLeads: number;
    conversions: number;
    revenue: number;
    avgDealSize: number;
    totalActivities: number;
    conversionRate: number;
  };
  individuals: Array<{
    agentId: string;
    name: string;
    leadsAssigned: number;
    conversions: number;
    revenue: number;
    activities: number;
    conversionRate: number;
  }>;
}> {}

// =============================================================================
// BILLING API
// =============================================================================

export interface PlansResponse extends ApiResponse<Plan[]> {}

export interface TenantPlanResponse extends ApiResponse<{
  plan: Plan;
  subscription: Subscription;
  usage: UsageCounters;
}> {}

export interface CheckoutRequest {
  plan_id: string;
}

export interface CheckoutResponse extends ApiResponse<{
  checkout_url: string;
  session_id: string;
}> {}

export interface LimitCheckRequest {
  action: 'leads' | 'whatsapp' | 'storage';
  quantity?: number;
}

export interface LimitCheckResponse extends ApiResponse<{
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}> {}

// =============================================================================
// TEAM API
// =============================================================================

export interface UsersListResponse extends ApiResponse<User[]> {}

export interface UserInviteRequest {
  name: string;
  email: string;
  phone?: string;
  role: 'agent' | 'manager';
}

export interface UserInviteResponse extends ApiResponse<User> {}

export interface UserUpdateRequest {
  name?: string;
  role?: 'agent' | 'manager';
  is_active?: boolean;
}

// =============================================================================
// WEBHOOK TYPES (for Stripe)
// =============================================================================

export interface StripeWebhookEvent {
  type: string;
  data: {
    object: any;
  };
}
