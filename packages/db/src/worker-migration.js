"use strict";
/**
 * Worker Service Database Migration
 *
 * Creates tables for:
 * - Outbox events
 * - Dead Letters (DLQ)
 * - Domain Events (materialized)
 * - Email logs
 * - Pending notifications
 * - Agent performance tracking
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = __importDefault(require("./index"));
async function migrate() {
    console.log('Running worker migration...');
    await index_1.default.query(`
    -- Outbox Events (reliable event emission)
    CREATE TABLE IF NOT EXISTS outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID NOT NULL,
      actor_user_id UUID,
      payload JSONB NOT NULL,
      schema_version INTEGER DEFAULT 1,
      occurred_at TIMESTAMPTZ DEFAULT NOW(),
      published_at TIMESTAMPTZ,
      attempts INTEGER DEFAULT 0,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON outbox_events(occurred_at) 
      WHERE published_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON outbox_events(tenant_id);

    -- Domain Events (materialized, for querying)
    CREATE TABLE IF NOT EXISTS domain_events (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID NOT NULL,
      actor_user_id UUID,
      payload JSONB NOT NULL,
      schema_version INTEGER DEFAULT 1,
      occurred_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_domain_events_tenant ON domain_events(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_domain_events_type ON domain_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_domain_events_entity ON domain_events(entity_type, entity_id);

    -- Dead Letters (DLQ)
    CREATE TABLE IF NOT EXISTS dead_letters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      queue VARCHAR(50) NOT NULL,
      job_name VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      error TEXT NOT NULL,
      failed_at TIMESTAMPTZ DEFAULT NOW(),
      attempts INTEGER DEFAULT 0,
      requeued_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_dlq_tenant ON dead_letters(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_dlq_queue ON dead_letters(queue);
    CREATE INDEX IF NOT EXISTS idx_dlq_unrequeued ON dead_letters(failed_at) 
      WHERE requeued_at IS NULL;

    -- Email Logs
    CREATE TABLE IF NOT EXISTS email_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      lead_id UUID,
      to_email VARCHAR(255) NOT NULL,
      subject VARCHAR(500) NOT NULL,
      status VARCHAR(50) DEFAULT 'sent',
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      delivered_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      idempotency_key VARCHAR(255)
    );
    CREATE INDEX IF NOT EXISTS idx_email_logs_tenant ON email_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_lead ON email_logs(lead_id);

    -- Pending Notifications (for agent dashboard)
    CREATE TABLE IF NOT EXISTS pending_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      lead_id UUID,
      agent_id UUID,
      type VARCHAR(50) NOT NULL,
      payload JSONB,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON pending_notifications(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_agent ON pending_notifications(agent_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON pending_notifications(agent_id) 
      WHERE read_at IS NULL;

    -- Agent Performance Tracking
    CREATE TABLE IF NOT EXISTS agent_performance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL,
      tenant_id UUID NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      response_time_score INTEGER,
      followup_score INTEGER,
      conversion_score INTEGER,
      activity_score INTEGER,
      composite_score INTEGER,
      leads_assigned INTEGER DEFAULT 0,
      leads_converted INTEGER DEFAULT 0,
      activities_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(agent_id, period_start, period_end)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_perf_tenant ON agent_performance(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_agent_perf_period ON agent_performance(period_start, period_end);

    -- Lead Activities (for detailed tracking)
    CREATE TABLE IF NOT EXISTS lead_activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      lead_id UUID NOT NULL,
      actor_user_id UUID,
      type VARCHAR(50) NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant ON lead_activities(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(type);

    -- Add reminder_sent_at to leads if not exists
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

  `);
    console.log('✅ Worker migration complete');
}
migrate().catch(console.error);
//# sourceMappingURL=worker-migration.js.map