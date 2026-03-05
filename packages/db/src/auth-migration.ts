/**
 * Authentication & Multi-tenancy Migration
 *
 * Creates tables for:
 * - Tenants (organizations/firms)
 * - Users (agents, managers)
 * - Refresh Tokens
 * - Audit Log
 */
import db from './index';

async function migrate() {
  console.log('Running auth migration...');

  await db.query(`
    -- Authentication & Multi-tenancy Schema
    -- Tenants (organizations/firms)
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE NOT NULL,
      slug VARCHAR(50) UNIQUE,
      plan VARCHAR(50) DEFAULT 'trial',
      max_agents INTEGER DEFAULT 10,
      is_active BOOLEAN DEFAULT true,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Users (agents, managers)
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      email_hash TEXT,
      password_hash TEXT NOT NULL,
      phone TEXT,
      phone_hash TEXT,
      role VARCHAR(20) NOT NULL DEFAULT 'agent',
      is_active BOOLEAN DEFAULT true,
      last_login_at TIMESTAMPTZ,
      login_count INTEGER DEFAULT 0,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
    CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);

    -- Refresh Tokens
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      rotated_from_id UUID REFERENCES refresh_tokens(id),
      user_agent TEXT,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

    -- Audit Log
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      actor_user_id UUID REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id UUID,
      metadata JSONB,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

    -- Add tenant_id to existing tables
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
    ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    ALTER TABLE commute_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

    -- Add encrypted PII columns
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_enc TEXT;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_enc TEXT;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_hash TEXT;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_hash TEXT;

    CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_leads_phone_hash ON leads(phone_hash);
    CREATE INDEX IF NOT EXISTS idx_leads_email_hash ON leads(email_hash);
    CREATE INDEX IF NOT EXISTS idx_visits_tenant ON site_visits(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_commute_tenant ON commute_requests(tenant_id);

    -- Insert default tenant for existing data
    INSERT INTO tenants (id, name, slug, plan)
    SELECT '00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default', 'trial'
    WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001');

    -- Backfill existing records
    UPDATE leads SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
    UPDATE projects SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
    UPDATE site_visits SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
    UPDATE commute_requests SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

    -- Update agents table to link to users
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
  `);

  console.log('✅ Auth migration complete');
}

migrate().catch(console.error);
