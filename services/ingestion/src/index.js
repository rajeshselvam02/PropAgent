"use strict";
/**
 * Ingestion Service - Updated with Idempotency + Concurrency (Phase 2)
 *
 * Changes:
 * - Idempotency middleware for POST endpoints
 * - Optimistic concurrency for PUT endpoints
 * - ETag/If-Match header support
 * - Upsert logic for duplicate leads
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("@propagent/db"));
const shared_1 = require("@propagent/shared");
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({ logger: true });
// Job queue client (import from worker)
const worker_1 = require("@propagent/worker");
const worker_2 = require("@propagent/worker");
// Create DB-backed idempotency middleware
const dbIdempotencyMiddleware = (0, shared_1.createDbIdempotencyMiddleware)(db_1.default);
// Health check
fastify.get('/health', async () => ({ status: 'ok', service: 'ingestion' }));
// ============================================
// META LEAD WEBHOOK (with idempotency)
// ============================================
fastify.post('/webhook/meta', { preHandler: [dbIdempotencyMiddleware] }, async (req, reply) => {
    const payload = req.body;
    // Parse lead data
    const fieldData = payload.entry?.[0]?.changes?.[0]?.value?.field_data || [];
    const leadData = {};
    fieldData.forEach((f) => {
        leadData[f.name] = f.values?.[0];
    });
    // Extract tenant from meta campaign or use default
    const tenantId = '00000000-0000-0000-0000-000000000001'; // TODO: Multi-tenant routing
    // Use UPSERT to handle duplicates (by phone_hash)
    const lead = await db_1.default.query(`
    INSERT INTO leads (
      tenant_id, name, phone, email, source,
      meta_campaign_id, meta_campaign_name, meta_adset_id, meta_ad_id,
      status, version
    ) VALUES ($1, $2, $3, $4, 'meta_facebook', $5, $6, $7, $8, 'new', 0)
    ON CONFLICT (tenant_id, phone_hash)
      WHERE phone_hash IS NOT NULL
    DO UPDATE SET
      name = COALESCE(EXCLUDED.name, leads.name),
      email = COALESCE(EXCLUDED.email, leads.email),
      meta_campaign_id = COALESCE(EXCLUDED.meta_campaign_id, leads.meta_campaign_id),
      meta_campaign_name = COALESCE(EXCLUDED.meta_campaign_name, leads.meta_campaign_name),
      meta_adset_id = COALESCE(EXCLUDED.meta_adset_id, leads.meta_adset_id),
      meta_ad_id = COALESCE(EXCLUDED.meta_ad_id, leads.meta_ad_id),
      updated_at = NOW(),
      version = leads.version + 1
    RETURNING id, tenant_id, version
  `, [
        tenantId,
        leadData.full_name,
        leadData.phone_number,
        leadData.email,
        payload.campaign_id,
        payload.campaign_name,
        payload.adset_id,
        payload.ad_id,
    ]);
    const newLead = lead.rows[0];
    // Emit lead.created event via outbox
    await (0, worker_2.createOutboxEvent)({
        tenantId: newLead.tenant_id,
        eventType: worker_2.DOMAIN_EVENTS.LEAD_CREATED,
        entityType: 'lead',
        entityId: newLead.id,
        payload: {
            name: leadData.full_name,
            phone: leadData.phone_number,
            source: 'meta_facebook',
            campaign: payload.campaign_name,
        },
    });
    // Queue WhatsApp welcome message
    await worker_1.whatsappQueue.add(worker_2.JOB_TYPES.WHATSAPP_SEND, {
        leadId: newLead.id,
        tenantId: newLead.tenant_id,
        to: leadData.phone_number,
        message: `Hi ${leadData.full_name || 'there'}! 👋 Thanks for your interest. I'll help you find your perfect property. Quick question - what's your budget range?`,
    });
    // Queue outbox publisher
    await worker_1.outboxQueue.add(worker_2.JOB_TYPES.OUTBOX_PUBLISH, { eventId: newLead.id });
    // Return response with version info
    reply.header('ETag', (0, shared_1.formatETag)(newLead.version));
    reply.send({ success: true, leadId: newLead.id, version: newLead.version });
});
// ============================================
// 99ACRES/MAGICBRICKS WEBHOOK (with idempotency)
// ============================================
fastify.post('/webhook/:source', { preHandler: [dbIdempotencyMiddleware] }, async (req, reply) => {
    const { source } = req.params;
    const payload = req.body;
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const lead = await db_1.default.query(`
    INSERT INTO leads (
      tenant_id, name, phone, email, source, project_interest, status, version
    ) VALUES ($1, $2, $3, $4, $5, $6, 'new', 0)
    ON CONFLICT (tenant_id, phone_hash)
      WHERE phone_hash IS NOT NULL
    DO UPDATE SET
      name = COALESCE(EXCLUDED.name, leads.name),
      email = COALESCE(EXCLUDED.email, leads.email),
      project_interest = COALESCE(EXCLUDED.project_interest, leads.project_interest),
      updated_at = NOW(),
      version = leads.version + 1
    RETURNING id, tenant_id, version
  `, [tenantId, payload.name, payload.phone, payload.email, source, payload.project]);
    const newLead = lead.rows[0];
    // Emit event
    await (0, worker_2.createOutboxEvent)({
        tenantId: newLead.tenant_id,
        eventType: worker_2.DOMAIN_EVENTS.LEAD_CREATED,
        entityType: 'lead',
        entityId: newLead.id,
        payload: { name: payload.name, source },
    });
    // Queue welcome
    await worker_1.whatsappQueue.add(worker_2.JOB_TYPES.WHATSAPP_SEND, {
        leadId: newLead.id,
        tenantId: newLead.tenant_id,
        to: payload.phone,
        message: `Hi ${payload.name}! Thanks for inquiring about ${payload.project || 'our properties'}. Let me help you find the perfect match.`,
    });
    await worker_1.outboxQueue.add(worker_2.JOB_TYPES.OUTBOX_PUBLISH, { eventId: newLead.id });
    reply.header('ETag', (0, shared_1.formatETag)(newLead.version));
    reply.send({ success: true, leadId: newLead.id, version: newLead.version });
});
// ============================================
// MANUAL LEAD ENTRY (with idempotency)
// ============================================
fastify.post('/api/leads', { preHandler: [dbIdempotencyMiddleware] }, async (req, reply) => {
    const { name, phone, email, source, project_interest, tenant_id } = req.body;
    const tenantId = tenant_id || '00000000-0000-0000-0000-000000000001';
    const lead = await db_1.default.query(`
    INSERT INTO leads (
      tenant_id, name, phone, email, source, project_interest, status, version
    ) VALUES ($1, $2, $3, $4, $5, $6, 'new', 0)
    ON CONFLICT (tenant_id, phone_hash)
      WHERE phone_hash IS NOT NULL
    DO UPDATE SET
      name = COALESCE(EXCLUDED.name, leads.name),
      email = COALESCE(EXCLUDED.email, leads.email),
      source = COALESCE(EXCLUDED.source, leads.source),
      project_interest = COALESCE(EXCLUDED.project_interest, leads.project_interest),
      updated_at = NOW(),
      version = leads.version + 1
    RETURNING *
  `, [tenantId, name, phone, email, source || 'walk_in', project_interest]);
    const newLead = lead.rows[0];
    // Emit event
    await (0, worker_2.createOutboxEvent)({
        tenantId,
        eventType: worker_2.DOMAIN_EVENTS.LEAD_CREATED,
        entityType: 'lead',
        entityId: newLead.id,
        payload: { name, source: source || 'walk_in' },
    });
    await worker_1.outboxQueue.add(worker_2.JOB_TYPES.OUTBOX_PUBLISH, { eventId: newLead.id });
    reply.header('ETag', (0, shared_1.formatETag)(newLead.version));
    reply.send({ success: true, data: newLead });
});
// ============================================
// GET LEAD (with ETag)
// ============================================
fastify.get('/api/leads/:id', async (req, reply) => {
    const { id } = req.params;
    const tenantId = '00000000-0000-0000-0000-000000000001'; // TODO: from auth
    const lead = await (0, shared_1.concurrencyAwareGet)(db_1.default, 'leads', id, tenantId, reply);
    if (!lead) {
        reply.code(404).send({ error: 'Lead not found' });
        return;
    }
    reply.send({ success: true, data: lead });
});
// ============================================
// MARK LEAD AS CONTACTED (with concurrency)
// ============================================
fastify.put('/api/leads/:id/contacted', async (req, reply) => {
    const { id } = req.params;
    const { agent_id, notes, version } = req.body;
    // Validate If-Match header
    const ifMatch = req.headers['if-match'];
    if (!ifMatch) {
        reply.code(428).send({ error: 'If-Match header required', code: 'MISSING_IF_MATCH' });
        return;
    }
    const expectedVersion = (0, shared_1.parseIfMatch)(ifMatch);
    if (expectedVersion === null) {
        reply.code(400).send({ error: 'Invalid If-Match header', code: 'INVALID_IF_MATCH' });
        return;
    }
    const tenantId = '00000000-0000-0000-0000-000000000001';
    // Versioned update
    const result = await (0, shared_1.executeVersionedUpdate)(db_1.default, 'leads', id, tenantId, expectedVersion, {
        status: 'contacted',
        last_contacted_at: 'NOW()',
        status_updated_at: 'NOW()',
        assigned_agent_id: agent_id || null
    });
    if (result.conflict) {
        reply.code(409).send({
            error: 'Lead was modified by another request',
            code: shared_1.CONFLICT_CODES.VERSION_MISMATCH,
            hint: 'Fetch the latest version and retry'
        });
        return;
    }
    if (!result.success) {
        reply.code(404).send({ error: 'Lead not found' });
        return;
    }
    const lead = result.data;
    // Log interaction
    await db_1.default.query(`
    INSERT INTO interactions (lead_id, agent_id, type, summary)
    VALUES ($1, $2, 'call', $3)
  `, [id, agent_id, notes || 'Lead contacted']);
    // Emit event
    await (0, worker_2.createOutboxEvent)({
        tenantId: lead.tenant_id,
        eventType: worker_2.DOMAIN_EVENTS.LEAD_STATUS_CHANGED,
        entityType: 'lead',
        entityId: id,
        actorUserId: agent_id,
        payload: { from: 'new', to: 'contacted' },
    });
    await worker_1.outboxQueue.add(worker_2.JOB_TYPES.OUTBOX_PUBLISH, { eventId: id });
    reply.header('ETag', (0, shared_1.formatETag)(lead.version));
    reply.send({ success: true, data: lead });
});
// ============================================
// UPDATE LEAD STATUS (with concurrency)
// ============================================
fastify.put('/api/leads/:id/status', async (req, reply) => {
    const { id } = req.params;
    const { status, notes, agent_id } = req.body;
    const validStatuses = ['new', 'contacted', 'qualified', 'visit_scheduled', 'visit_completed', 'converted', 'lost'];
    if (!validStatuses.includes(status)) {
        reply.code(400).send({ error: 'Invalid status' });
        return;
    }
    // Validate If-Match header
    const ifMatch = req.headers['if-match'];
    if (!ifMatch) {
        reply.code(428).send({ error: 'If-Match header required', code: 'MISSING_IF_MATCH' });
        return;
    }
    const expectedVersion = (0, shared_1.parseIfMatch)(ifMatch);
    if (expectedVersion === null) {
        reply.code(400).send({ error: 'Invalid If-Match header', code: 'INVALID_IF_MATCH' });
        return;
    }
    // Get current status
    const current = await db_1.default.query('SELECT status, tenant_id, version FROM leads WHERE id = $1', [id]);
    if (current.rows.length === 0) {
        reply.code(404).send({ error: 'Lead not found' });
        return;
    }
    // Check version
    if (current.rows[0].version !== expectedVersion) {
        reply.code(409).send({
            error: 'Lead was modified by another request',
            code: shared_1.CONFLICT_CODES.VERSION_MISMATCH,
            currentVersion: current.rows[0].version,
            expectedVersion,
        });
        return;
    }
    const oldStatus = current.rows[0].status;
    const tenantId = current.rows[0].tenant_id;
    const result = await db_1.default.query(`
    UPDATE leads
    SET status = $1, status_updated_at = NOW(), version = version + 1
    WHERE id = $2 AND version = $3
    RETURNING *
  `, [status, id, expectedVersion]);
    if (result.rows.length === 0) {
        reply.code(409).send({ error: 'Concurrent modification detected', code: shared_1.CONFLICT_CODES.VERSION_MISMATCH });
        return;
    }
    const lead = result.rows[0];
    // Log interaction
    await db_1.default.query(`
    INSERT INTO interactions (lead_id, agent_id, type, summary)
    VALUES ($1, $2, 'status_change', $3)
  `, [id, agent_id, `Status changed from ${oldStatus} to ${status}. ${notes || ''}`]);
    // Emit event
    await (0, worker_2.createOutboxEvent)({
        tenantId,
        eventType: worker_2.DOMAIN_EVENTS.LEAD_STATUS_CHANGED,
        entityType: 'lead',
        entityId: id,
        actorUserId: agent_id,
        payload: { from: oldStatus, to: status },
    });
    await worker_1.outboxQueue.add(worker_2.JOB_TYPES.OUTBOX_PUBLISH, { eventId: id });
    reply.header('ETag', (0, shared_1.formatETag)(lead.version));
    reply.send({ success: true, data: lead });
});
// ============================================
// CALCULATE INTENT SCORE (with idempotency)
// ============================================
fastify.post('/api/leads/:id/calculate-score', { preHandler: [dbIdempotencyMiddleware] }, async (req, reply) => {
    const { id } = req.params;
    const leadResult = await db_1.default.query('SELECT * FROM leads WHERE id = $1', [id]);
    const lead = leadResult.rows[0];
    if (!lead) {
        reply.code(404).send({ error: 'Lead not found' });
        return;
    }
    let score = 0;
    // Budget (30 points)
    if (lead.budget_min && lead.budget_max) {
        const budget = (lead.budget_min + lead.budget_max) / 2;
        if (budget >= 5000000)
            score += 30;
        else if (budget >= 2000000)
            score += 20;
        else
            score += 10;
    }
    // Timeline (25 points)
    if (lead.timeline === 'asap')
        score += 25;
    else if (lead.timeline === '1-3_months')
        score += 20;
    else if (lead.timeline === '3-6_months')
        score += 10;
    // Location (20 points)
    if (lead.preferred_location)
        score += 20;
    // Purpose (15 points)
    if (lead.purpose === 'self_use')
        score += 15;
    else if (lead.purpose === 'investment')
        score += 10;
    // Engagement (10 points)
    if (lead.last_contacted_at)
        score += 5;
    if (lead.email)
        score += 5;
    const intentClass = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
    await db_1.default.query(`
    UPDATE leads
    SET intent_score = $1, intent_class = $2, version = version + 1
    WHERE id = $3
    RETURNING version
  `, [score, intentClass, id]);
    // Emit event
    await (0, worker_2.createOutboxEvent)({
        tenantId: lead.tenant_id,
        eventType: worker_2.DOMAIN_EVENTS.LEAD_SCORE_CALCULATED,
        entityType: 'lead',
        entityId: id,
        payload: { score, intentClass },
    });
    reply.send({ success: true, data: { intent_score: score, intent_class: intentClass } });
});
// ============================================
// AUTO-ASSIGN LEAD (with idempotency)
// ============================================
fastify.post('/api/leads/:id/assign', { preHandler: [dbIdempotencyMiddleware] }, async (req, reply) => {
    const { id } = req.params;
    // Find least loaded agent
    const agentResult = await db_1.default.query(`
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
    const result = await db_1.default.query(`
    UPDATE leads
    SET assigned_agent_id = $1, assigned_at = NOW(), version = version + 1
    WHERE id = $2
    RETURNING tenant_id, version
  `, [agent.id, id]);
    const tenantId = result.rows[0]?.tenant_id;
    // Emit event
    if (tenantId) {
        await (0, worker_2.createOutboxEvent)({
            tenantId,
            eventType: worker_2.DOMAIN_EVENTS.LEAD_ASSIGNED,
            entityType: 'lead',
            entityId: id,
            payload: { agentId: agent.id, agentName: agent.name },
        });
        await worker_1.outboxQueue.add(worker_2.JOB_TYPES.OUTBOX_PUBLISH, { eventId: id });
    }
    reply.send({ success: true, data: { agent_id: agent.id, agent_name: agent.name } });
});
// ============================================
// GET LEADS (with pagination)
// ============================================
fastify.get('/api/leads', async (req, reply) => {
    const { status, agent_id, tenant_id, limit = 50, offset = 0 } = req.query;
    let query = `
    SELECT l.*, a.name as agent_name, p.name as project_name
    FROM leads l
    LEFT JOIN agents a ON l.assigned_agent_id = a.id
    LEFT JOIN projects p ON l.project_interest = p.id
    WHERE 1=1
  `;
    const params = [];
    if (tenant_id) {
        params.push(tenant_id);
        query += ` AND l.tenant_id = $${params.length}`;
    }
    if (status) {
        params.push(status);
        query += ` AND l.status = $${params.length}`;
    }
    if (agent_id) {
        params.push(agent_id);
        query += ` AND l.assigned_agent_id = $${params.length}`;
    }
    query += `
    ORDER BY CASE l.intent_class WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 ELSE 3 END, l.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
    params.push(limit, offset);
    const result = await db_1.default.query(query, params);
    reply.send({ success: true, data: result.rows, pagination: { limit, offset } });
});
// ============================================
// SCHEDULE FOLLOW-UP
// ============================================
fastify.post('/api/leads/:id/follow-up', { preHandler: [dbIdempotencyMiddleware] }, async (req, reply) => {
    const { id } = req.params;
    const { scheduled_at, notes, agent_id } = req.body;
    await db_1.default.query(`
    UPDATE leads
    SET next_follow_up_at = $1, version = version + 1
    WHERE id = $2
  `, [scheduled_at, id]);
    await db_1.default.query(`
    INSERT INTO interactions (lead_id, type, summary)
    VALUES ($1, 'note', $2)
  `, [id, `Follow-up scheduled for ${scheduled_at}. ${notes || ''}`]);
    // Queue follow-up reminder job (delayed)
    const delay = new Date(scheduled_at).getTime() - Date.now();
    if (delay > 0) {
        await worker_1.followupsQueue.add(worker_2.JOB_TYPES.FOLLOWUP_REMIND, {
            leadId: id,
            tenantId: '00000000-0000-0000-0000-000000000001', // TODO: get from lead
            followupId: `fu-${id}-${Date.now()}`,
        }, { delay });
    }
    // Get lead for tenant
    const leadResult = await db_1.default.query('SELECT tenant_id FROM leads WHERE id = $1', [id]);
    if (leadResult.rows[0]?.tenant_id) {
        await (0, worker_2.createOutboxEvent)({
            tenantId: leadResult.rows[0].tenant_id,
            eventType: worker_2.DOMAIN_EVENTS.FOLLOWUP_SCHEDULED,
            entityType: 'lead',
            entityId: id,
            actorUserId: agent_id,
            payload: { scheduledAt: scheduled_at },
        });
    }
    reply.send({ success: true, message: 'Follow-up scheduled' });
});
// ============================================
// GET OVERDUE FOLLOW-UPS
// ============================================
fastify.get('/api/follow-ups/overdue', async (req, reply) => {
    const result = await db_1.default.query(`
    SELECT l.*, a.name as agent_name
    FROM leads l
    LEFT JOIN agents a ON l.assigned_agent_id = a.id
    WHERE l.next_follow_up_at < NOW()
    AND l.status NOT IN ('converted', 'lost')
    ORDER BY l.next_follow_up_at ASC
  `);
    reply.send({ success: true, data: result.rows });
});
// ============================================
// START SERVER
// ============================================
const start = async () => {
    const port = Number(process.env.INGESTION_PORT) || 4000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Ingestion on port ${port}`);
};
start().catch(console.error);
//# sourceMappingURL=index.js.map