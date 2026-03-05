"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrate = migrate;
exports.seedPlans = seedPlans;
const index_1 = __importDefault(require("./index"));
async function migrate() {
    console.log('Running billing migrations...');
    await index_1.default.query(`
    -- Plans (subscription tiers)
    CREATE TABLE IF NOT EXISTS plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(50) UNIQUE NOT NULL,
      stripe_price_id VARCHAR(255) UNIQUE,
      limits JSONB NOT NULL DEFAULT '{}',
      features JSONB NOT NULL DEFAULT '{}',
      price_monthly INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT true,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Tenant Subscriptions
    CREATE TABLE IF NOT EXISTS tenant_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255) UNIQUE,
      plan_id UUID NOT NULL REFERENCES plans(id),
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN DEFAULT false,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON tenant_subscriptions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON tenant_subscriptions(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON tenant_subscriptions(status);

    -- Usage Counters (per billing period)
    CREATE TABLE IF NOT EXISTS usage_counters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      leads_count INTEGER DEFAULT 0,
      whatsapp_count INTEGER DEFAULT 0,
      storage_mb DECIMAL(10, 2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, period_start)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_tenant ON usage_counters(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_counters(period_start, period_end);

    -- Feature Flags (per tenant overrides)
    CREATE TABLE IF NOT EXISTS feature_flags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      flags JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON feature_flags(tenant_id);

    -- Invoice History
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      stripe_invoice_id VARCHAR(255) UNIQUE,
      subscription_id UUID REFERENCES tenant_subscriptions(id),
      amount INTEGER NOT NULL,
      currency VARCHAR(3) DEFAULT 'inr',
      status VARCHAR(50) NOT NULL,
      invoice_url TEXT,
      invoice_pdf TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);

    -- Usage Events (for metered billing)
    CREATE TABLE IF NOT EXISTS usage_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      event_id VARCHAR(255) UNIQUE,
      quantity INTEGER DEFAULT 1,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON usage_events(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events(created_at);
  `);
    console.log('✅ Billing migrations complete');
}
async function seedPlans() {
    console.log('Seeding plans...');
    const plans = [
        {
            name: 'Starter',
            stripe_price_id: null, // Set via env in production
            limits: {
                leads: 500,
                whatsapp: 1000,
                storage_mb: 1000,
                agents: 3,
                projects: 5
            },
            features: {
                analytics: 'basic',
                whatsapp_automation: true,
                email_automation: true,
                site_visits: true,
                meta_integration: true,
                custom_integrations: false,
                priority_support: false,
                api_access: false,
                data_retention_days: 90
            },
            price_monthly: 15000, // ₹15,000
            display_order: 1
        },
        {
            name: 'Growth',
            stripe_price_id: null,
            limits: {
                leads: 2000,
                whatsapp: 5000,
                storage_mb: 5000,
                agents: 10,
                projects: 20
            },
            features: {
                analytics: 'advanced',
                whatsapp_automation: true,
                email_automation: true,
                site_visits: true,
                meta_integration: true,
                custom_integrations: false,
                priority_support: false,
                api_access: true,
                data_retention_days: 365
            },
            price_monthly: 35000, // ₹35,000
            display_order: 2
        },
        {
            name: 'Enterprise',
            stripe_price_id: null,
            limits: {
                leads: -1, // unlimited
                whatsapp: -1,
                storage_mb: -1,
                agents: -1,
                projects: -1
            },
            features: {
                analytics: 'advanced',
                whatsapp_automation: true,
                email_automation: true,
                site_visits: true,
                meta_integration: true,
                custom_integrations: true,
                priority_support: true,
                api_access: true,
                data_retention_days: -1 // unlimited
            },
            price_monthly: 75000, // ₹75,000
            display_order: 3
        }
    ];
    for (const plan of plans) {
        await index_1.default.query(`
      INSERT INTO plans (name, stripe_price_id, limits, features, price_monthly, display_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (name) DO UPDATE SET
        limits = EXCLUDED.limits,
        features = EXCLUDED.features,
        price_monthly = EXCLUDED.price_monthly,
        display_order = EXCLUDED.display_order,
        updated_at = NOW()
    `, [plan.name, plan.stripe_price_id, JSON.stringify(plan.limits), JSON.stringify(plan.features), plan.price_monthly, plan.display_order]);
    }
    console.log('✅ Plans seeded');
}
async function run() {
    await migrate();
    await seedPlans();
}
run().catch(console.error);
//# sourceMappingURL=billing-migration.js.map