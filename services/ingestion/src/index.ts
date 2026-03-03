import Fastify from 'fastify';
import dotenv from 'dotenv';
import db from '@propagent/db';

dotenv.config();

const fastify = Fastify({ logger: true });

// Health check
fastify.get('/health', async () => ({ status: 'ok', service: 'ingestion' }));

// Meta Lead Webhook
fastify.post('/webhook/meta', async (req, reply) => {
  const payload = req.body as any;
  
  // Parse lead data
  const fieldData = payload.entry?.[0]?.changes?.[0]?.value?.field_data || [];
  const leadData: Record<string, string> = {};
  fieldData.forEach((f: any) => { leadData[f.name] = f.values?.[0]; });

  const lead = await db.query(`
    INSERT INTO leads (name, phone, email, source, meta_campaign_id, meta_campaign_name, status)
    VALUES ($1, $2, $3, 'meta_facebook', $4, $5, 'new')
    RETURNING id
  `, [leadData.full_name, leadData.phone_number, leadData.email, payload.campaign_id, payload.campaign_name]);

  // TODO: Publish to Redis for WhatsApp service
  // TODO: Send WhatsApp welcome message

  reply.send({ success: true, leadId: lead.rows[0].id });
});

// 99acres/MagicBricks Webhook
fastify.post('/webhook/:source', async (req, reply) => {
  const { source } = req.params as { source: string };
  const payload = req.body as any;

  const lead = await db.query(`
    INSERT INTO leads (name, phone, email, source, project_interest, status)
    VALUES ($1, $2, $3, $4, $5, 'new')
    RETURNING id
  `, [payload.name, payload.phone, payload.email, source, payload.project]);

  reply.send({ success: true, leadId: lead.rows[0].id });
});

// Manual Lead Entry
fastify.post('/api/leads', async (req, reply) => {
  const { name, phone, email, source, project_interest } = req.body as any;
  
  const lead = await db.query(`
    INSERT INTO leads (name, phone, email, source, project_interest, status)
    VALUES ($1, $2, $3, $4, $5, 'new')
    RETURNING *
  `, [name, phone, email, source || 'walk_in', project_interest]);

  reply.send({ success: true, data: lead.rows[0] });
});

// Lead Lifecycle Endpoints

// Mark lead as contacted
fastify.put('/api/leads/:id/contacted', async (req, reply) => {
  const { id } = req.params as any;
  const { agent_id, notes } = req.body as any;
  
  const result = await db.query(`
    UPDATE leads 
    SET status = 'contacted', 
        last_contacted_at = NOW(),
        status_updated_at = NOW(),
        assigned_agent_id = COALESCE($1, assigned_agent_id)
    WHERE id = $2
    RETURNING *
  `, [agent_id, id]);
  
  // Log interaction
  await db.query(`
    INSERT INTO interactions (lead_id, agent_id, type, summary)
    VALUES ($1, $2, 'call', $3)
  `, [id, agent_id, notes || 'Lead contacted']);
  
  reply.send({ success: true, data: result.rows[0] });
});

// Update lead status
fastify.put('/api/leads/:id/status', async (req, reply) => {
  const { id } = req.params as any;
  const { status, notes } = req.body as any;
  
  const validStatuses = ['new', 'contacted', 'qualified', 'visit_scheduled', 'visit_completed', 'converted', 'lost'];
  if (!validStatuses.includes(status)) {
    reply.code(400).send({ error: 'Invalid status' });
    return;
  }
  
  const result = await db.query(`
    UPDATE leads 
    SET status = $1, status_updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `, [status, id]);
  
  reply.send({ success: true, data: result.rows[0] });
});

// Calculate and update intent score
fastify.post('/api/leads/:id/calculate-score', async (req, reply) => {
  const { id } = req.params as any;
  
  const leadResult = await db.query('SELECT * FROM leads WHERE id = $1', [id]);
  const lead = leadResult.rows[0];
  
  if (!lead) {
    reply.code(404).send({ error: 'Lead not found' });
    return;
  }
  
  let score = 0;
  
  // Budget match (30 points)
  if (lead.budget_min && lead.budget_max) {
    const budget = (lead.budget_min + lead.budget_max) / 2;
    if (budget >= 5000000) score += 30;
    else if (budget >= 2000000) score += 20;
    else score += 10;
  }
  
  // Timeline (25 points)
  if (lead.timeline === 'asap') score += 25;
  else if (lead.timeline === '1-3_months') score += 20;
  else if (lead.timeline === '3-6_months') score += 10;
  
  // Location match (20 points)
  if (lead.preferred_location) score += 20;
  
  // Purpose (15 points)
  if (lead.purpose === 'self_use') score += 15;
  else if (lead.purpose === 'investment') score += 10;
  
  // Engagement (10 points)
  if (lead.last_contacted_at) score += 5;
  if (lead.email) score += 5;
  
  // Classify
  const intentClass = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  
  await db.query(`
    UPDATE leads SET intent_score = $1, intent_class = $2 WHERE id = $3
  `, [score, intentClass, id]);
  
  reply.send({ success: true, data: { intent_score: score, intent_class: intentClass } });
});

// Auto-assign lead to agent (round-robin)
fastify.post('/api/leads/:id/assign', async (req, reply) => {
  const { id } = req.params as any;
  
  // Find least loaded active agent
  const agentResult = await db.query(`
    SELECT a.id, a.name, COUNT(l.id) as lead_count
    FROM agents a
    LEFT JOIN leads l ON a.id = l.assigned_agent_id AND l.status NOT IN ('converted', 'lost')
    WHERE a.active = true
    GROUP BY a.id, a.name
    ORDER BY lead_count ASC, RANDOM()
    LIMIT 1
  `);
  
  if (agentResult.rows.length === 0) {
    reply.code(400).send({ error: 'No active agents available' });
    return;
  }
  
  const agent = agentResult.rows[0];
  
  await db.query(`
    UPDATE leads 
    SET assigned_agent_id = $1, assigned_at = NOW()
    WHERE id = $2
  `, [agent.id, id]);
  
  reply.send({ success: true, data: { agent_id: agent.id, agent_name: agent.name } });
});

// Get leads sorted by priority
fastify.get('/api/leads', async (req, reply) => {
  const { status, agent_id, limit = 50, offset = 0 } = req.query as any;
  
  let query = `
    SELECT l.*, a.name as agent_name, p.name as project_name
    FROM leads l
    LEFT JOIN agents a ON l.assigned_agent_id = a.id
    LEFT JOIN projects p ON l.project_interest = p.id
    WHERE 1=1
  `;
  const params: any[] = [];
  
  if (status) {
    params.push(status);
    query += ` AND l.status = $${params.length}`;
  }
  
  if (agent_id) {
    params.push(agent_id);
    query += ` AND l.assigned_agent_id = $${params.length}`;
  }
  
  // Sort by intent_class priority, then by created_at DESC
  query += `
    ORDER BY 
      CASE l.intent_class 
        WHEN 'hot' THEN 1 
        WHEN 'warm' THEN 2 
        WHEN 'cold' THEN 3 
      END,
      l.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  
  params.push(limit, offset);
  
  const result = await db.query(query, params);
  
  // Get total count
  const countResult = await db.query(`SELECT COUNT(*) FROM leads WHERE 1=1`);
  
  reply.send({ 
    success: true, 
    data: result.rows,
    pagination: {
      total: countResult.rows[0].count,
      limit,
      offset
    }
  });
});

// Schedule follow-up
fastify.post('/api/leads/:id/follow-up', async (req, reply) => {
  const { id } = req.params as any;
  const { scheduled_at, notes } = req.body as any;
  
  const result = await db.query(`
    UPDATE leads 
    SET next_follow_up_at = $1
    WHERE id = $2
    RETURNING *
  `, [scheduled_at, id]);
  
  // Log
  await db.query(`
    INSERT INTO interactions (lead_id, type, summary)
    VALUES ($1, 'note', $2)
  `, [id, `Follow-up scheduled for ${scheduled_at}. ${notes || ''}`]);
  
  reply.send({ success: true, data: result.rows[0] });
});

// Get overdue follow-ups
fastify.get('/api/follow-ups/overdue', async (req, reply) => {
  const result = await db.query(`
    SELECT l.*, a.name as agent_name
    FROM leads l
    LEFT JOIN agents a ON l.assigned_agent_id = a.id
    WHERE l.next_follow_up_at < NOW()
    AND l.status NOT IN ('converted', 'lost')
    ORDER BY l.next_follow_up_at ASC
  `);
  
  reply.send({ success: true, data: result.rows });
});

// Start
const start = async () => {
  const port = Number(process.env.INGESTION_PORT) || 4000;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Ingestion on port ${port}`);
};

start().catch(console.error);
