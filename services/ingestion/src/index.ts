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

// Start
const start = async () => {
  const port = Number(process.env.INGESTION_PORT) || 4000;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Ingestion on port ${port}`);
};

start().catch(console.error);
