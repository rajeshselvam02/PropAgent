// Lead Source Types
export type LeadSource = 
  | 'meta_facebook' 
  | 'meta_instagram' 
  | '99acres' 
  | 'magicbricks' 
  | 'housing' 
  | 'website' 
  | 'whatsapp' 
  | 'referral' 
  | 'walk_in';

// Lead Status Types
export type LeadStatus = 
  | 'new' 
  | 'contacted' 
  | 'qualified' 
  | 'visit_scheduled' 
  | 'visited' 
  | 'negotiating' 
  | 'closed_won' 
  | 'closed_lost' 
  | 'nurture';

// Intent Score Classification
export type IntentClass = 'hot' | 'warm' | 'cold';

// Property Types
export type PropertyType = 'villa' | 'plot' | 'commercial' | 'apartment';

// Lead Purpose
export type LeadPurpose = 'investment' | 'self_use' | 'commercial';

// Timeline
export type LeadTimeline = 'asap' | '1-3_months' | '3-6_months' | '6_months_plus' | 'exploring';

// Interaction Types
export type InteractionType = 'call' | 'whatsapp' | 'email' | 'visit' | 'note' | 'system';
export type CallType = 'whatsapp' | 'regular';
export type CallPurpose = 'visit_confirmation' | 'follow_up' | 'qualification';

// Visit Status
export type VisitStatus = 
  | 'scheduled' 
  | 'confirmed' 
  | 'in_progress' 
  | 'completed' 
  | 'no_show' 
  | 'cancelled' 
  | 'rescheduled';

// Commute Status
export type CommuteStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'assigned' 
  | 'completed' 
  | 'cancelled';

// Core Interfaces
export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  projectInterest?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetRange?: string;
  preferredLocation?: string;
  purpose?: LeadPurpose;
  timeline?: LeadTimeline;
  intentScore: number;
  intentClass: IntentClass;
  status: LeadStatus;
  assignedAgentId?: string;
  metaCampaignId?: string;
  metaCampaignName?: string;
  metaAdsetId?: string;
  metaAdId?: string;
  metaLeadCost?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: 'agent' | 'senior_agent' | 'team_lead' | 'manager';
  active: boolean;
  projectsAssigned: string[];
}

export interface Project {
  id: string;
  name: string;
  type: PropertyType;
  location: string;
  address: string;
  priceMin: number;
  priceMax: number;
  status: 'active' | 'sold_out' | 'upcoming';
}

export interface SiteVisit {
  id: string;
  leadId: string;
  projectId: string;
  agentId: string;
  scheduledAt: Date;
  status: VisitStatus;
  commuteRequired: boolean;
  numVisitors: number;
  pickupLocation?: string;
  callRecordingUrl?: string;
  callTranscript?: string;
}

export interface CommuteRequest {
  id: string;
  visitId: string;
  leadId: string;
  numPeople: number;
  pickupAddress: string;
  preferredDate: Date;
  preferredTime: string;
  status: CommuteStatus;
  approvedBy?: string;
  approvedAt?: Date;
  driverName?: string;
  driverPhone?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  vendorName?: string;
  estimatedCost?: number;
}

export interface CallRecording {
  id: string;
  leadId: string;
  visitId?: string;
  agentId: string;
  callType: CallType;
  recordingUrl: string;
  transcript?: string;
  durationSeconds: number;
  callPurpose: CallPurpose;
  createdAt: Date;
}

export interface MetaLeadPayload {
  leadgenId: string;
  formId: string;
  createdTime: number;
  fieldData: Array<{
    name: string;
    values: string[];
  }>;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adId?: string;
}

// Event Types for Event Bus
export type EventType = 
  | 'lead.created'
  | 'lead.qualified'
  | 'lead.assigned'
  | 'visit.scheduled'
  | 'visit.confirmed'
  | 'visit.completed'
  | 'commute.requested'
  | 'commute.approved'
  | 'commute.assigned'
  | 'call.recorded';

export interface Event {
  type: EventType;
  payload: any;
  timestamp: Date;
}

// Qualification Questions
export interface QualificationResponse {
  budget: string;
  timeline: LeadTimeline;
  location: string;
  purpose: LeadPurpose;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Dashboard Types
export interface DashboardStats {
  leads: {
    total: number;
    byStatus: Record<LeadStatus, number>;
    bySource: Record<LeadSource, number>;
  };
  conversions: {
    total: number;
    revenue: number;
  };
  responseTime: {
    avgFirstResponseSeconds: number;
    avgCallResponseSeconds: number;
  };
  visits: {
    scheduled: number;
    completed: number;
    noShow: number;
    cancelled: number;
  };
}

export interface AgentDashboard {
  agent: Agent;
  today: {
    hotLeads: number;
    callsPending: number;
    visitsScheduled: number;
  };
  hotLeads: Lead[];
  upcomingVisits: SiteVisit[];
  stats: {
    thisWeek: {
      leadsHandled: number;
      callsMade: number;
      visitsCompleted: number;
      conversions: number;
    };
  };
}
