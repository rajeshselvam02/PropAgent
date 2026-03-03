import db from './index';

async function migrate() {
  console.log('Running migrations...');

  await db.query(`
    -- Projects
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50) UNIQUE,
      type VARCHAR(50) NOT NULL,
      location VARCHAR(100) NOT NULL,
      address TEXT,
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      developer VARCHAR(255),
      price_min INTEGER,
      price_max INTEGER,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Agents
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(20) UNIQUE NOT NULL,
      email VARCHAR(255),
      employee_id VARCHAR(50) UNIQUE,
      role VARCHAR(50) DEFAULT 'agent',
      projects_assigned UUID[],
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      last_active_at TIMESTAMP
    );

    -- Leads
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255),
      phone VARCHAR(20) UNIQUE NOT NULL,
      email VARCHAR(255),
      alternate_phone VARCHAR(20),
      
      -- Source tracking
      source VARCHAR(50) NOT NULL,
      source_campaign VARCHAR(255),
      utm_source VARCHAR(100),
      utm_medium VARCHAR(100),
      utm_campaign VARCHAR(255),
      
      -- Meta attribution
      meta_campaign_id VARCHAR(100),
      meta_campaign_name VARCHAR(255),
      meta_adset_id VARCHAR(100),
      meta_ad_id VARCHAR(100),
      meta_lead_cost DECIMAL(10, 2),
      
      -- Interest
      project_interest UUID REFERENCES projects(id),
      property_type_preference VARCHAR(50),
      budget_min INTEGER,
      budget_max INTEGER,
      budget_range VARCHAR(50),
      preferred_location VARCHAR(100),
      purpose VARCHAR(50),
      timeline VARCHAR(50),
      
      -- Qualification
      intent_score INTEGER DEFAULT 0,
      intent_class VARCHAR(20) DEFAULT 'cold',
      qualification_status VARCHAR(50) DEFAULT 'pending',
      qualification_completed_at TIMESTAMP,
      qualification_responses JSONB,
      
      -- Assignment
      assigned_agent_id UUID REFERENCES agents(id),
      assigned_at TIMESTAMP,
      
      -- Status
      status VARCHAR(50) DEFAULT 'new',
      status_updated_at TIMESTAMP,
      
      -- Metadata
      notes TEXT,
      tags TEXT[],
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      last_contacted_at TIMESTAMP,
      next_follow_up_at TIMESTAMP
    );

    -- Interactions
    CREATE TABLE IF NOT EXISTS interactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID REFERENCES leads(id) NOT NULL,
      agent_id UUID REFERENCES agents(id),
      type VARCHAR(50) NOT NULL,
      direction VARCHAR(50),
      summary TEXT,
      duration_seconds INTEGER,
      status VARCHAR(50),
      recording_url TEXT,
      transcript TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Site Visits
    CREATE TABLE IF NOT EXISTS site_visits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID REFERENCES leads(id) NOT NULL,
      project_id UUID REFERENCES projects(id) NOT NULL,
      agent_id UUID REFERENCES agents(id) NOT NULL,
      scheduled_at TIMESTAMP NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      status VARCHAR(50) DEFAULT 'scheduled',
      confirmed_at TIMESTAMP,
      reminder_sent_at TIMESTAMP,
      check_in_at TIMESTAMP,
      check_out_at TIMESTAMP,
      feedback TEXT,
      rating INTEGER,
      would_recommend BOOLEAN,
      next_steps TEXT,
      cancelled_reason TEXT,
      rescheduled_to UUID REFERENCES site_visits(id),
      
      -- Commute fields
      commute_required BOOLEAN DEFAULT false,
      num_visitors INTEGER DEFAULT 1,
      pickup_location TEXT,
      pickup_lat DECIMAL(10, 8),
      pickup_lng DECIMAL(11, 8),
      call_recording_url TEXT,
      call_transcript TEXT,
      
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Commute Requests
    CREATE TABLE IF NOT EXISTS commute_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      visit_id UUID REFERENCES site_visits(id) NOT NULL,
      lead_id UUID REFERENCES leads(id) NOT NULL,
      num_people INTEGER NOT NULL,
      pickup_address TEXT NOT NULL,
      pickup_lat DECIMAL(10, 8),
      pickup_lng DECIMAL(11, 8),
      preferred_date DATE NOT NULL,
      preferred_time TIME NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      
      -- Approval
      approved_by UUID REFERENCES agents(id),
      approved_at TIMESTAMP,
      approval_signature TEXT,
      
      -- Cab Details
      driver_name VARCHAR(255),
      driver_phone VARCHAR(20),
      vehicle_number VARCHAR(20),
      vehicle_type VARCHAR(50),
      vendor_name VARCHAR(100),
      estimated_cost DECIMAL(10, 2),
      actual_cost DECIMAL(10, 2),
      
      -- Tracking
      driver_lat DECIMAL(10, 8),
      driver_lng DECIMAL(11, 8),
      driver_eta_minutes INTEGER,
      
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Call Recordings
    CREATE TABLE IF NOT EXISTS call_recordings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID REFERENCES leads(id) NOT NULL,
      visit_id UUID REFERENCES site_visits(id),
      agent_id UUID REFERENCES agents(id) NOT NULL,
      call_type VARCHAR(50) NOT NULL,
      recording_url TEXT NOT NULL,
      transcript TEXT,
      duration_seconds INTEGER,
      call_purpose VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- WhatsApp Messages
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID REFERENCES leads(id) NOT NULL,
      message_id VARCHAR(255) UNIQUE,
      direction VARCHAR(50) NOT NULL,
      message_type VARCHAR(50),
      content TEXT,
      template_name VARCHAR(100),
      template_params JSONB,
      status VARCHAR(50),
      sent_at TIMESTAMP,
      delivered_at TIMESTAMP,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Meta Campaigns
    CREATE TABLE IF NOT EXISTS meta_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id VARCHAR(100) UNIQUE NOT NULL,
      campaign_name VARCHAR(255) NOT NULL,
      adset_id VARCHAR(100),
      ad_id VARCHAR(100),
      platform VARCHAR(50),
      project_id UUID REFERENCES projects(id),
      status VARCHAR(50) DEFAULT 'active',
      total_leads INTEGER DEFAULT 0,
      total_cost DECIMAL(15, 2) DEFAULT 0,
      total_conversions INTEGER DEFAULT 0,
      total_revenue DECIMAL(15, 2) DEFAULT 0,
      roas DECIMAL(10, 2),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Daily Analytics
    CREATE TABLE IF NOT EXISTS daily_analytics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL,
      project_id UUID REFERENCES projects(id),
      agent_id UUID REFERENCES agents(id),
      new_leads INTEGER DEFAULT 0,
      hot_leads INTEGER DEFAULT 0,
      warm_leads INTEGER DEFAULT 0,
      cold_leads INTEGER DEFAULT 0,
      qualified_leads INTEGER DEFAULT 0,
      calls_made INTEGER DEFAULT 0,
      calls_connected INTEGER DEFAULT 0,
      whatsapp_sent INTEGER DEFAULT 0,
      visits_scheduled INTEGER DEFAULT 0,
      visits_completed INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      revenue DECIMAL(15, 2) DEFAULT 0,
      avg_first_response_time INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(date, project_id, agent_id)
    );

    -- Follow-up tracking
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0;
    
    -- Conversion tracking
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_value DECIMAL(15, 2);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;
    
    -- Indexes for new queries
    CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(next_follow_up_at);
    CREATE INDEX IF NOT EXISTS idx_leads_intent_class ON leads(intent_class);
    CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
    
    -- Function to increment follow-up count
    CREATE OR REPLACE FUNCTION increment_follow_up()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.follow_up_count := OLD.follow_up_count + 1;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Trigger
    DROP TRIGGER IF EXISTS trigger_increment_follow_up ON leads;
    CREATE TRIGGER trigger_increment_follow_up
    BEFORE UPDATE OF next_follow_up_at ON leads
    FOR EACH ROW
    WHEN (OLD.next_follow_up_at IS DISTINCT FROM NEW.next_follow_up_at)
    EXECUTE FUNCTION increment_follow_up();
  `);

  console.log('✅ Migrations complete');
}

migrate().catch(console.error);
