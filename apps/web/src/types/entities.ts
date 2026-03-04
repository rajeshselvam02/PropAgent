/**
 * PropAgent Entity Types
 * 
 * Maps database schema to TypeScript types for frontend use
 */

// =============================================================================
// TENANT & USERS
// =============================================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'trial' | 'starter' | 'growth' | 'enterprise';
  max_agents: number;
  is_active: boolean;
  settings: Record<string, any>;
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'agent' | 'manager' | 'admin';
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface Session {
  user: User;
  tenant: Tenant;
  access_token: string;
}

// =============================================================================
// LEADS
// =============================================================================

export type LeadStatus = 
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'visit_scheduled'
  | 'visit_completed'
  | 'converted'
  | 'lost';

export type IntentClass = 'hot' | 'warm' | 'cold';

export interface Lead {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  email?: string;
  
  // Source tracking
  source: string;
  source_campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  
  // Meta attribution
  meta_campaign_id?: string;
  meta_campaign_name?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  meta_lead_cost?: number;
  
  // Interest
  project_interest?: string;
  property_type_preference?: string;
  budget_min?: number;
  budget_max?: number;
  budget_range?: string;
  preferred_location?: string;
  purpose?: 'self_use' | 'investment' | 'commercial';
  timeline?: 'asap' | '1-3_months' | '3-6_months' | 'exploring';
  
  // Qualification
  intent_score: number;
  intent_class: IntentClass;
  qualification_status: 'pending' | 'in_progress' | 'completed';
  qualification_responses?: Record<string, string>;
  
  // Assignment
  assigned_agent_id?: string;
  assigned_at?: string;
  agent_name?: string; // from join
  
  // Status
  status: LeadStatus;
  status_updated_at?: string;
  
  // Follow-up
  next_follow_up_at?: string;
  follow_up_count: number;
  last_contacted_at?: string;
  
  // Deal
  deal_value?: number;
  converted_at?: string;
  
  // Metadata
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  version: number;
}

export interface LeadFilters {
  status?: LeadStatus;
  intent_class?: IntentClass;
  agent_id?: string;
  source?: string;
  project_id?: string;
  search?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// INTERACTIONS & ACTIVITIES
// =============================================================================

export type InteractionType = 'call' | 'whatsapp' | 'email' | 'note' | 'status_change';

export interface Interaction {
  id: string;
  lead_id: string;
  agent_id?: string;
  type: InteractionType;
  direction?: 'inbound' | 'outbound';
  summary: string;
  duration_seconds?: number;
  status?: string;
  recording_url?: string;
  transcript?: string;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  tenant_id: string;
  lead_id: string;
  actor_user_id?: string;
  type: string;
  meta?: Record<string, any>;
  created_at: string;
}

// =============================================================================
// FOLLOW-UPS
// =============================================================================

export interface FollowUp {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  scheduled_at: string;
  status: 'pending' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  notes?: string;
  agent_id?: string;
  agent_name?: string;
}

// =============================================================================
// SITE VISITS
// =============================================================================

export type VisitStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled';

export interface SiteVisit {
  id: string;
  tenant_id: string;
  lead_id: string;
  project_id: string;
  agent_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: VisitStatus;
  confirmed_at?: string;
  reminder_sent_at?: string;
  feedback?: string;
  rating?: number;
  next_steps?: string;
  cancelled_reason?: string;
  created_at: string;
}

// =============================================================================
// PROJECTS & AGENTS
// =============================================================================

export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  code?: string;
  type: 'villa' | 'plot' | 'commercial';
  location: string;
  address?: string;
  developer?: string;
  price_min?: number;
  price_max?: number;
  status: 'active' | 'sold_out' | 'upcoming';
  inventory_count?: number;
  created_at: string;
}

export interface Agent {
  id: string;
  name: string;
  phone: string;
  email?: string;
  employee_id?: string;
  role: 'agent' | 'senior_agent' | 'team_lead';
  projects_assigned?: string[];
  active: boolean;
  last_active_at?: string;
  created_at: string;
}

// =============================================================================
// ANALYTICS
// =============================================================================

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
}

export interface FunnelData {
  period: { from: string; to: string };
  stages: FunnelStage[];
  conversionRates: {
    newToQualified: number;
    qualifiedToScheduled: number;
    scheduledToVisited: number;
    visitedToConverted: number;
    overall: number;
  };
  lost: number;
  total: number;
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  compositeScore: number;
  breakdown: {
    responseTime: number;
    followup: number;
    conversion: number;
    activity: number;
    dealValue: number;
  };
  metrics: {
    leadsAssigned: number;
    leadsConverted: number;
    activities: number;
  };
}

export interface SourceROI {
  source: string;
  totalLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  totalCost: number;
  totalRevenue: number;
  costPerLead: number;
  costPerQualified: number;
  costPerConversion: number;
  roi: number;
  conversionRate: number;
  avgDaysToConversion: number;
}

export interface AnalyticsSummary {
  period: { from: string; to: string };
  leads: {
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
  };
  conversions: {
    total: number;
    revenue: number;
    avgDealValue: number;
    rate: number;
  };
  visits: {
    scheduled: number;
    completed: number;
    noShow: number;
    cancelled: number;
  };
  activities: {
    calls: number;
    whatsapp: number;
    emails: number;
  };
  topAgents: Array<{
    id: string;
    name: string;
    leads: number;
    conversions: number;
    revenue: number;
  }>;
}

// =============================================================================
// BILLING
// =============================================================================

export interface Plan {
  id: string;
  name: string;
  stripe_price_id?: string;
  limits: {
    leads: number;
    whatsapp: number;
    storage_mb: number;
    agents: number;
    projects: number;
  };
  features: {
    analytics: 'basic' | 'advanced';
    whatsapp_automation: boolean;
    email_automation: boolean;
    site_visits: boolean;
    meta_integration: boolean;
    custom_integrations: boolean;
    priority_support: boolean;
    api_access: boolean;
  };
  price_monthly: number;
  display_order: number;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  plan_id: string;
  plan?: Plan;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
}

export interface UsageCounters {
  leads_count: number;
  whatsapp_count: number;
  storage_mb: number;
  period_start: string;
  period_end: string;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
}
