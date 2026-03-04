import { FastifyRequest, FastifyReply } from 'fastify';
export interface PlanLimits {
    leads: number;
    whatsapp: number;
    storage_mb: number;
    agents: number;
    projects: number;
}
export interface PlanFeatures {
    analytics: 'basic' | 'advanced';
    whatsapp_automation: boolean;
    email_automation: boolean;
    site_visits: boolean;
    meta_integration: boolean;
    custom_integrations: boolean;
    priority_support: boolean;
    api_access: boolean;
}
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'incomplete' | 'trialing';
export interface TenantSubscription {
    id: string;
    tenant_id: string;
    plan_name: string;
    plan_id: string;
    status: SubscriptionStatus;
    limits: PlanLimits;
    features: PlanFeatures;
    current_period_end: Date;
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
}
export interface UsageCounter {
    leads_count: number;
    whatsapp_count: number;
    storage_mb: number;
    period_start: Date;
    period_end: Date;
}
export declare class BillingError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly upgradeMessage: string;
    constructor(code: string, message: string, statusCode?: number);
}
export declare function getTenantSubscription(tenantId: string): Promise<TenantSubscription | null>;
export declare function getTenantUsage(tenantId: string): Promise<UsageCounter>;
export declare function canPerformAction(tenantId: string, action: 'lead' | 'whatsapp' | 'storage', quantity?: number): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
}>;
export declare function incrementUsage(tenantId: string, action: 'lead' | 'whatsapp' | 'storage', quantity?: number): Promise<void>;
export declare function hasFeatureAccess(tenantId: string, feature: keyof PlanFeatures): Promise<boolean>;
export declare function checkLeadLimit(req: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function checkWhatsAppLimit(req: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function requireFeature(feature: keyof PlanFeatures): (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare function getAvailablePlans(): Promise<any>;
export declare function createCheckoutSession(tenantId: string, planId: string, successUrl: string, cancelUrl: string): Promise<{
    sessionId: string;
    url: string;
}>;
export type { PlanLimits as PlanLimitsType, PlanFeatures as PlanFeaturesType };
//# sourceMappingURL=billing.d.ts.map