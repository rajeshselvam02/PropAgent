"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingError = void 0;
exports.getTenantSubscription = getTenantSubscription;
exports.getTenantUsage = getTenantUsage;
exports.canPerformAction = canPerformAction;
exports.incrementUsage = incrementUsage;
exports.hasFeatureAccess = hasFeatureAccess;
exports.checkLeadLimit = checkLeadLimit;
exports.checkWhatsAppLimit = checkWhatsAppLimit;
exports.requireFeature = requireFeature;
exports.getAvailablePlans = getAvailablePlans;
exports.createCheckoutSession = createCheckoutSession;
const db_1 = __importDefault(require("@propagent/db"));
// Billing error
class BillingError extends Error {
    code;
    statusCode;
    upgradeMessage;
    constructor(code, message, statusCode = 402) {
        super(message);
        this.name = 'BillingError';
        this.code = code;
        this.statusCode = statusCode;
        this.upgradeMessage = message;
    }
}
exports.BillingError = BillingError;
// Get tenant's current subscription and plan
async function getTenantSubscription(tenantId) {
    const result = await db_1.default.query(`
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
        const tenantResult = await db_1.default.query('SELECT plan FROM tenants WHERE id = $1', [tenantId]);
        if (tenantResult.rows.length === 0) {
            return null;
        }
        // Return trial/default plan
        const trialPlan = await db_1.default.query("SELECT * FROM plans WHERE name = 'Starter' AND is_active = true");
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
async function getTenantUsage(tenantId) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const result = await db_1.default.query(`
    SELECT * FROM usage_counters
    WHERE tenant_id = $1 AND period_start <= $2 AND period_end >= $2
    ORDER BY period_start DESC
    LIMIT 1
  `, [tenantId, now]);
    if (result.rows.length === 0) {
        // Create usage counter for current period
        const createResult = await db_1.default.query(`
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
async function canPerformAction(tenantId, action, quantity = 1) {
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
async function incrementUsage(tenantId, action, quantity = 1) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const column = action === 'lead' ? 'leads_count' :
        action === 'whatsapp' ? 'whatsapp_count' :
            'storage_mb';
    await db_1.default.query(`
    INSERT INTO usage_counters (tenant_id, period_start, period_end, ${column})
    SELECT $1, $2, $3, $4
    ON CONFLICT (tenant_id, period_start) DO UPDATE SET
      ${column} = usage_counters.${column} + $4,
      updated_at = NOW()
  `, [tenantId, periodStart, new Date(now.getFullYear(), now.getMonth() + 1, 0), quantity]);
    // Log usage event
    await db_1.default.query(`
    INSERT INTO usage_events (tenant_id, event_type, quantity)
    VALUES ($1, $2, $3)
  `, [tenantId, `${action}.created`, quantity]);
}
// Check feature access
async function hasFeatureAccess(tenantId, feature) {
    const subscription = await getTenantSubscription(tenantId);
    if (!subscription) {
        return false;
    }
    // Check tenant-specific feature flags first
    const flagsResult = await db_1.default.query('SELECT flags FROM feature_flags WHERE tenant_id = $1', [tenantId]);
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
async function checkLeadLimit(req, reply) {
    const user = req.user;
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
async function checkWhatsAppLimit(req, reply) {
    const user = req.user;
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
function requireFeature(feature) {
    return async (req, reply) => {
        const user = req.user;
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
async function getAvailablePlans() {
    const result = await db_1.default.query(`
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
function formatPrice(pricePaise) {
    const rupees = pricePaise / 100;
    if (rupees >= 100000) {
        return `₹${(rupees / 100000).toFixed(1)}L`;
    }
    return `₹${rupees.toLocaleString('en-IN')}`;
}
// Create Stripe checkout session
async function createCheckoutSession(tenantId, planId, successUrl, cancelUrl) {
    // Get plan
    const planResult = await db_1.default.query('SELECT * FROM plans WHERE id = $1 AND is_active = true', [planId]);
    if (planResult.rows.length === 0) {
        throw new BillingError('PLAN_NOT_FOUND', 'Plan not found', 404);
    }
    const plan = planResult.rows[0];
    // Get tenant
    const tenantResult = await db_1.default.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
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
//# sourceMappingURL=billing.js.map