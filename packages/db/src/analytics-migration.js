"use strict";
/**
 * Analytics Migration
 *
 * Creates tables for:
 * - Deals (conversion tracking)
 * - Enhanced daily_analytics
 * - Source ROI tracking
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = __importDefault(require("./index"));
async function migrate() {
    console.log('Running analytics migration...');
    await index_1.default.query(`
    -- Deals table for conversion tracking
    CREATE TABLE IF NOT EXISTS deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID REFERENCES leads(id) NOT NULL,
      tenant_id UUID,
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'INR',
      converted_at TIMESTAMPTZ DEFAULT NOW(),
      source_attribution VARCHAR(50),
      project_id UUID REFERENCES projects(id),
      agent_id UUID REFERENCES agents(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(lead_id)
    );

    CREATE INDEX IF NOT EXISTS idx_deals_lead ON deals(lead_id);
    CREATE INDEX IF NOT EXISTS idx_deals_tenant ON deals(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_deals_converted_at ON deals(converted_at);

    -- Add conversion tracking columns to leads (if not exists)
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'converted_at') THEN
        ALTER TABLE leads ADD COLUMN converted_at TIMESTAMPTZ;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'deal_value') THEN
        ALTER TABLE leads ADD COLUMN deal_value DECIMAL(15, 2);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'tenant_id') THEN
        ALTER TABLE leads ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
      END IF;
    END $$;

    -- Enhanced daily_analytics table
    CREATE TABLE IF NOT EXISTS daily_analytics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL,
      tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
      new_leads INTEGER DEFAULT 0,
      hot_leads INTEGER DEFAULT 0,
      warm_leads INTEGER DEFAULT 0,
      cold_leads INTEGER DEFAULT 0,
      qualified_leads INTEGER DEFAULT 0,
      visits_scheduled INTEGER DEFAULT 0,
      visits_completed INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      revenue DECIMAL(15, 2) DEFAULT 0,
      calls_made INTEGER DEFAULT 0,
      calls_connected INTEGER DEFAULT 0,
      whatsapp_sent INTEGER DEFAULT 0,
      avg_first_response_time INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(date, tenant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_analytics_date ON daily_analytics(date);
    CREATE INDEX IF NOT EXISTS idx_daily_analytics_tenant ON daily_analytics(tenant_id);

    -- Source ROI tracking
    CREATE TABLE IF NOT EXISTS source_roi (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source VARCHAR(50) NOT NULL,
      tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
      date DATE NOT NULL,
      total_leads INTEGER DEFAULT 0,
      qualified_leads INTEGER DEFAULT 0,
      converted_leads INTEGER DEFAULT 0,
      total_cost DECIMAL(15, 2) DEFAULT 0,
      total_revenue DECIMAL(15, 2) DEFAULT 0,
      avg_time_to_conversion INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source, tenant_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_source_roi_source ON source_roi(source);
    CREATE INDEX IF NOT EXISTS idx_source_roi_date ON source_roi(date);

    -- Funnel stages view
    CREATE OR REPLACE VIEW funnel_stages AS
    SELECT 
      id,
      status,
      CASE 
        WHEN status IN ('new', 'contacted') THEN 'stage_1_new'
        WHEN status IN ('qualified', 'hot_lead') THEN 'stage_2_qualified'
        WHEN status IN ('visit_scheduled') THEN 'stage_3_scheduled'
        WHEN status IN ('visit_completed') THEN 'stage_4_visited'
        WHEN status = 'converted' THEN 'stage_5_converted'
        WHEN status = 'lost' THEN 'stage_lost'
        ELSE 'stage_unknown'
      END as funnel_stage
    FROM leads;
  `);
    console.log('✅ Analytics migration complete');
}
migrate().catch(console.error);
//# sourceMappingURL=analytics-migration.js.map