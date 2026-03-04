"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("@propagent/db"));
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({ logger: true });
// Health
fastify.get('/health', async () => ({ status: 'ok', service: 'commute' }));
// Create commute request
fastify.post('/api/commute-requests', async (req, reply) => {
    const { visit_id, num_people, pickup_address, preferred_date, preferred_time } = req.body;
    const result = await db_1.default.query(`
    INSERT INTO commute_requests (visit_id, lead_id, num_people, pickup_address, preferred_date, preferred_time, status)
    SELECT $1, lead_id, $2, $3, $4, $5, 'pending'
    FROM site_visits WHERE id = $1
    RETURNING *
  `, [visit_id, num_people, pickup_address, preferred_date, preferred_time]);
    reply.send({ success: true, data: result.rows[0] });
});
// List pending commute requests
fastify.get('/api/commute-requests', async (req, reply) => {
    const { status, date } = req.query;
    let query = `
    SELECT cr.*, l.name as lead_name, l.phone as lead_phone, sv.scheduled_at
    FROM commute_requests cr
    JOIN leads l ON cr.lead_id = l.id
    JOIN site_visits sv ON cr.visit_id = sv.id
    WHERE 1=1
  `;
    const params = [];
    if (status) {
        params.push(status);
        query += ` AND cr.status = $${params.length}`;
    }
    if (date) {
        params.push(date);
        query += ` AND cr.preferred_date = $${params.length}`;
    }
    query += ' ORDER BY cr.created_at DESC';
    const result = await db_1.default.query(query, params);
    reply.send({ success: true, data: result.rows });
});
// Approve commute request
fastify.put('/api/commute-requests/:id/approve', async (req, reply) => {
    const { id } = req.params;
    const { approved_by, signature } = req.body;
    const result = await db_1.default.query(`
    UPDATE commute_requests 
    SET status = 'approved', approved_by = $1, approved_at = NOW(), approval_signature = $2
    WHERE id = $3
    RETURNING *
  `, [approved_by, signature, id]);
    reply.send({ success: true, data: result.rows[0] });
});
// Assign cab details
fastify.put('/api/commute-requests/:id/assign-cab', async (req, reply) => {
    const { id } = req.params;
    const { driver_name, driver_phone, vehicle_number, vehicle_type, vendor_name, estimated_cost } = req.body;
    const result = await db_1.default.query(`
    UPDATE commute_requests 
    SET status = 'assigned',
        driver_name = $1, driver_phone = $2, vehicle_number = $3,
        vehicle_type = $4, vendor_name = $5, estimated_cost = $6,
        updated_at = NOW()
    WHERE id = $7
    RETURNING *
  `, [driver_name, driver_phone, vehicle_number, vehicle_type, vendor_name, estimated_cost, id]);
    reply.send({ success: true, data: result.rows[0] });
});
// Get commute stats
fastify.get('/api/commute/stats', async (req, reply) => {
    const result = await db_1.default.query(`
    SELECT 
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE status = 'approved' OR status = 'assigned' OR status = 'completed') as cab_provided,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_approval,
      COALESCE(SUM(estimated_cost), 0) as total_estimated_cost,
      COALESCE(SUM(actual_cost), 0) as total_actual_cost
    FROM commute_requests
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `);
    reply.send({ success: true, data: result.rows[0] });
});
const start = async () => {
    const port = Number(process.env.COMMUTE_PORT) || 4002;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Commute service on port ${port}`);
};
start().catch(console.error);
//# sourceMappingURL=index.js.map