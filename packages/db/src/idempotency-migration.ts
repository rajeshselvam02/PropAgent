/**
 * Idempotency Migration
 *
 * Creates the idempotency_keys table for storing request/response pairs
 * to support safe retries of POST requests.
 */

import db from './index';

async function migrate() {
  console.log('Running idempotency migration...');

  await db.query(`
    -- Idempotency Keys Store
    -- Stores request hashes and responses for deduplication
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      key VARCHAR(255) NOT NULL,
      body_hash VARCHAR(64) NOT NULL,
      method VARCHAR(10) NOT NULL DEFAULT 'POST',
      path VARCHAR(500) NOT NULL,
      status_code INTEGER NOT NULL,
      response_body JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
      CONSTRAINT unique_tenant_key UNIQUE(tenant_id, key)
    );

    -- Index for fast lookups
    CREATE INDEX IF NOT EXISTS idx_idempotency_tenant_key ON idempotency_keys(tenant_id, key);
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

    -- Add version column to leads for optimistic concurrency
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
    
    -- Create index for version-based queries
    CREATE INDEX IF NOT EXISTS idx_leads_version ON leads(id, version);

    -- Add unique constraints for deduplication (with nullable email handling)
    -- First create unique index for phone (required field)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tenant_phone_unique 
      ON leads(tenant_id, phone_hash) 
      WHERE phone_hash IS NOT NULL;
    
    -- Create unique index for email (nullable field - use COALESCE pattern)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tenant_email_unique 
      ON leads(tenant_id, email_hash) 
      WHERE email_hash IS NOT NULL;

    -- Function to clean up expired idempotency keys
    CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
    RETURNS void AS $$
    BEGIN
      DELETE FROM idempotency_keys WHERE expires_at < NOW();
    END;
    $$ LANGUAGE plpgsql;
  `);

  console.log('✅ Idempotency migration complete');
}

migrate().catch(console.error);
