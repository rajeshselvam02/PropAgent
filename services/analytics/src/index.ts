import Fastify from 'fastify';
import dotenv from 'dotenv';
import db from '@propagent/db';

dotenv.config();
const fastify = Fastify({ logger: true });

// Health
fastify.get('/health', async () => ({ status: 'ok', service: 'analytics' }));

// Dashboard summary
fastify.get('/api/analytics/summary', async (req, reply) => {
  const { from, to } = req.query as any;
  
  const leadsByStatus = await db.query(`
    SELECT status, COUNT(*) as count FROM leads
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY status
  `, [from || '2026-01-01', to || 'NOW()']);
  
  const leadsBySource = await db.query(`
    SELECT source, COUNT(*) as count FROM leads
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY source
  `, [from || '2026-01-01', to || 'NOW()']);
  
  const conversions = await db.query(`
    SELECT COUNT(*) as total, COALESCE(SUM(estimated_cost), 0) as revenue
    FROM leads WHERE status = 'closed_won'
    AND created_at >= $1 AND created_at <= $2
  `, [from || '2026-01-01', to || 'NOW()']);
  
  const visits = await db.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
    FROM site_visits
    WHERE scheduled_at >= $1 AND scheduled_at <= $2
  `, [from || '2026-01-01', to || 'NOW()']);
  
  reply.send({
    success: true,
    data: {
      leads: {
        byStatus: Object.fromEntries(leadsByStatus.rows.map((r: any) => [r.status, r.count])),
        bySource: Object.fromEntries(leadsBySource.rows.map((r: any) => [r.source, r.count]))
      },
      conversions: conversions.rows[0],
      visits: visits.rows[0]
    }
  });
});

// Agent leaderboard
fastify.get('/api/analytics/leaderboard', async (req, reply) => {
  const { period } = req.query as any;
  
  const result = await db.query(`
    SELECT a.id, a.name, 
      COUNT(DISTINCT l.id) as leads,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'closed_won') as conversions,
      COALESCE(SUM(CASE WHEN l.status = 'closed_won' THEN l.budget_max END), 0) as revenue
    FROM agents a
    LEFT JOIN leads l ON a.id = l.assigned_agent_id
    WHERE l.created_at >= NOW() - INTERVAL '1 month'
    GROUP BY a.id, a.name
    ORDER BY conversions DESC, revenue DESC
    LIMIT 10
  `);
  
  reply.send({ success: true, data: result.rows });
});

// Meta campaigns performance
fastify.get('/api/analytics/meta-campaigns', async (req, reply) => {
  const result = await db.query(`
    SELECT meta_campaign_name, 
      COUNT(*) as leads,
      COALESCE(SUM(meta_lead_cost), 0) as total_cost,
      COUNT(*) FILTER (WHERE status = 'closed_won') as conversions,
      COALESCE(SUM(CASE WHEN status = 'closed_won' THEN budget_max END), 0) as revenue
    FROM leads
    WHERE meta_campaign_id IS NOT NULL
    GROUP BY meta_campaign_name
    ORDER BY leads DESC
  `);
  
  reply.send({ success: true, data: result.rows });
});

const start = async () => {
  const port = Number(process.env.ANALYTICS_PORT) || 4003;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Analytics service on port ${port}`);
};

start().catch(console.error);
