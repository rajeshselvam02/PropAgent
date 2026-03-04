import db from '@propagent/db';
import { FastifyRequest, FastifyReply } from 'fastify';

// Plan limits interface
export interface PlanLimits {
  leads: number;        // -1 for unlimited
  whatsapp: number;     // -1 for unlimited
  storage_mb: number;   // -1 for unlimited
  agents: number;       // -1 for unlimited
  projects: number;     // -1 for unlimited
}

// Plan features interface
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

// Subscription status
export type SubscriptionStatus = 
  | 'active' 
  | 'past_due' 
  | 'cancelled' 
  | 'incomplete' 
  | 'trialing';

// Tenant subscription info
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

// Usage counter
export interface UsageCounter {
  leads_count: number;
  whatsapp_count: number;
  storage_mb: number;
  period_start: Date;
  period_end: Date;
}

// Billing error
export class BillingError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly upgradeMessage: string;

  constructor(code: string, message: string, statusCode: number = 402) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.statusCode = statusCode;
    this.upgradeMessage = message;
  }
}

// Get tenant's current subscription and plan
export async function getTenantSubscription(tenantId: string): Promise<TenantSubscription | null> {
  const result = await db.query(`
    SELECT 
      ts.*,
      p.name as plan_name,
      p.limits,
      p.features
    FROM tenant_subscriptions ts
    JOIN plans p ON ts.plan_id = p.id
    WHERE ts.tenant_id = $1 AND ts.status = 'active'
  `, [tenantId]);

  if (result.rows.length === 0) {
    // Check if tenant exists and return trial plan
    const tenantResult = await db.query(
      'SELECT plan FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return null;
    }

    // Return trial/default plan
    const trialPlan = await db.query(
      "SELECT * FROM plans WHERE name = 'Starter' AND is_active = true"
    );

    if (trialPlan.rows.length === 0) {
      return null;
    }

    return {
      id: 'trial',
      tenant_id: tenantId,
      plan_name: 'Starter',
      plan_id: trialPlan.rows[0].id,
      status: 'trialing',
      limits: trialPlan.rows[0].limits,
      features: trialPlan.rows[0].features,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
  }

  const row = result.rows[0];
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_name: row.plan_name,
    plan_id: row.plan_id,
    status: row.status,
    limits: row.limits,
    features: row.features,
    current_period_end: row.current_period_end,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id
  };
}

// Get tenant's current usage
export async function getTenantUsage(tenantId: string): Promise<UsageCounter> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const result = await db.query(`
    SELECT * FROM usage_counters
    WHERE tenant_id = $1 AND period_start <= $2 AND period_end >= $2
    ORDER BY period_start DESC
    LIMIT 1
  `, [tenantId, now]);

  if (result.rows.length === 0) {
    // Create usage counter for current period
    const createResult = await db.query(`
      INSERT INTO usage_counters (tenant_id, period_start, period_end)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [tenantId, periodStart, periodEnd]);

    return {
      leads_count: 0,
      whatsapp_count: 0,
      storage_mb: 0,
      period_start: createResult.rows[0].period_start,
      period_end: createResult.rows[0].period_end
    };
  }

  const row = result.rows[0];
  return {
    leads_count: row.leads_count,
    whatsapp_count: row.whatsapp_count,
    storage_mb: parseFloat(row.storage_mb) || 0,
    period_start: row.period_start,
    period_end: row.period_end
  };
}

// Check if tenant can perform action
export async function canPerformAction(
  tenantId: string,
  action: 'lead' | 'whatsapp' | 'storage',
  quantity: number = 1
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const subscription = await getTenantSubscription(tenantId);
  
  if (!subscription) {
    return { allowed: false, remaining: 0, limit: 0 };
  }

  const usage = await getTenantUsage(tenantId);

  switch (action) {
    case 'lead': {
      const limit = subscription.limits.leads;
      if (limit === -1) {
        return { allowed: true, remaining: Infinity, limit: -1 };
      }
      const remaining = Math.max(0, limit - usage.leads_count);
      return {
        allowed: usage.leads_count + quantity <= limit,
        remaining,
        limit
      };
    }
    case 'whatsapp': {
      const limit = subscription.limits.whatsapp;
      if (limit === -1) {
        return { allowed: true, remaining: Infinity, limit: -1 };
      }
      const remaining = Math.max(0, limit - usage.whatsapp_count);
      return {
        allowed: usage.whatsapp_count + quantity <= limit,
        remaining,
        limit
      };
    }
    case 'storage': {
      const limit = subscription.limits.storage_mb;
      if (limit === -1) {
        return { allowed: true, remaining: Infinity, limit: -1 };
      }
      const remaining = Math.max(0, limit - usage.storage_mb);
      return {
        allowed: usage.storage_mb + quantity <= limit,
        remaining,
        limit
      };
    }
    default:
      return { allowed: false, remaining: 0, limit: 0 };
  }
}

// Increment usage counter
export async function incrementUsage(
  tenantId: string,
  action: 'lead' | 'whatsapp' | 'storage',
  quantity: number = 1
): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const column = action === 'lead' ? 'leads_count' : 
                 action === 'whatsapp' ? 'whatsapp_count' : 
                 'storage_mb';

  await db.query(`
    INSERT INTO usage_counters (tenant_id, period_start, period_end, ${column})
    SELECT $1, $2, $3, $4
    ON CONFLICT (tenant_id, period_start) DO UPDATE SET
      ${column} = usage_counters.${column} + $4,
      updated_at = NOW()
  `, [tenantId, periodStart, new Date(now.getFullYear(), now.getMonth() + 1, 0), quantity]);

  // Log usage event
  await db.query(`
    INSERT INTO usage_events (tenant_id, event_type, quantity)
    VALUES ($1, $2, $3)
  `, [tenantId, `${action}.created`, quantity]);
}

// Check feature access
export async function hasFeatureAccess(
  tenantId: string,
  feature: keyof PlanFeatures
): Promise<boolean> {
  const subscription = await getTenantSubscription(tenantId);
  
  if (!subscription) {
    return false;
  }

  // Check tenant-specific feature flags first
  const flagsResult = await db.query(
    'SELECT flags FROM feature_flags WHERE tenant_id = $1',
    [tenantId]
  );

  if (flagsResult.rows.length > 0) {
    const flags = flagsResult.rows[0].flags;
    if (feature in flags) {
      return flags[feature] === true;
    }
  }

  // Fall back to plan features
  return subscription.features[feature] === true;
}

// Middleware to check lead limit
export async function checkLeadLimit(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user;
  if (!user?.tenant_id) {
    reply.code(401).send({ error: 'Not authenticated' });
    return;
  }

  const check = await canPerformAction(user.tenant_id, 'lead');
  
  if (!check.allowed) {
    const subscription = await getTenantSubscription(user.tenant_id);
    const planName = subscription?.plan_name || 'Starter';
    
    reply.code(402).send({
      error: 'Lead limit exceeded',
      code: 'LIMIT_EXCEEDED',
      message: `You have reached your monthly lead limit of ${check.limit}. Upgrade your plan to add more leads.`,
      current_usage: check.limit - check.remaining,
      limit: check.limit,
      plan: planName,
      upgrade_url: '/billing/upgrade'
    });
    return;
  }
}

// Middleware to check WhatsApp limit
export async function checkWhatsAppLimit(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user;
  if (!user?.tenant_id) {
    reply.code(401).send({ error: 'Not authenticated' });
    return;
  }

  const check = await canPerformAction(user.tenant_id, 'whatsapp');
  
  if (!check.allowed) {
    const subscription = await getTenantSubscription(user.tenant_id);
    const planName = subscription?.plan_name || 'Starter';
    
    reply.code(402).send({
      error: 'WhatsApp limit exceeded',
      code: 'LIMIT_EXCEEDED',
      message: `You have reached your monthly WhatsApp message limit of ${check.limit}. Upgrade your plan to send more messages.`,
      current_usage: check.limit - check.remaining,
      limit: check.limit,
      plan: planName,
      upgrade_url: '/billing/upgrade'
    });
    return;
  }
}

// Middleware factory for feature access
export function requireFeature(feature: keyof PlanFeatures) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!user?.tenant_id) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const hasAccess = await hasFeatureAccess(user.tenant_id, feature);
    
    if (!hasAccess) {
      reply.code(402).send({
        error: 'Feature not available',
        code: 'FEATURE_NOT_AVAILABLE',
        message: `This feature is not available on your current plan. Please upgrade to access ${feature.replace(/_/g, ' ')}.`,
        feature,
        upgrade_url: '/billing/upgrade'
      });
      return;
    }
  };
}

// Get all available plans
export async function getAvailablePlans() {
  const result = await db.query(`
    SELECT id, name, limits, features, price_monthly, display_order
    FROM plans
    WHERE is_active = true
    ORDER BY display_order
  `);

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    limits: row.limits,
    features: row.features,
    price_monthly: row.price_monthly,
    price_display: formatPrice(row.price_monthly)
  }));
}

// Format price for display
function formatPrice(pricePaise: number): string {
  const rupees = pricePaise / 100;
  if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(1)}L`;
  }
  return `₹${rupees.toLocaleString('en-IN')}`;
}

// Create Stripe checkout session
export async function createCheckoutSession(
  tenantId: string,
  planId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  // Get plan
  const planResult = await db.query(
    'SELECT * FROM plans WHERE id = $1 AND is_active = true',
    [planId]
  );

  if (planResult.rows.length === 0) {
    throw new BillingError('PLAN_NOT_FOUND', 'Plan not found', 404);
  }

  const plan = planResult.rows[0];

  // Get tenant
  const tenantResult = await db.query(
    'SELECT * FROM tenants WHERE id = $1',
    [tenantId]
  );

  if (tenantResult.rows.length === 0) {
    throw new BillingError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  }

  const tenant = tenantResult.rows[0];

  // In production, use actual Stripe SDK
  // For now, return mock checkout session
  const sessionId = `cs_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

  return {
    sessionId,
    url: `${process.env.STRIPE_CHECKOUT_URL || 'https://checkout.stripe.com'}?session_id=${sessionId}`
  };
}

// Export types
export type { PlanLimits as PlanLimitsType, PlanFeatures as PlanFeaturesType };
