"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("@propagent/db"));
const crypto_1 = __importDefault(require("crypto"));
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({ logger: true });
// Security: Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60 * 1000;
function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT)
        return false;
    entry.count++;
    return true;
}
// Security: API Key validation
function validateApiKey(apiKey) {
    const validKeys = (process.env.API_KEYS || '').split(',').filter(Boolean);
    return validKeys.includes(apiKey) || apiKey === process.env.MASTER_API_KEY;
}
// Security: HMAC signature verification for webhooks
function verifySignature(payload, signature, secret) {
    const expected = crypto_1.default.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
// Security: Sanitize input
function sanitize(input) {
    return input
        .replace(/[<>]/g, '')
        .replace(/'/g, "''")
        .trim()
        .substring(0, 1000);
}
// Security middleware
fastify.addHook('onRequest', async (req, reply) => {
    const ip = req.ip;
    // Skip rate limit for health checks
    if (req.url === '/health')
        return;
    // Rate limiting
    if (!checkRateLimit(ip)) {
        reply.code(429).send({ error: 'Rate limit exceeded' });
        return;
    }
    // API key check for protected routes
    if (req.url.startsWith('/api/') && !req.url.includes('/webhook')) {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || !validateApiKey(apiKey)) {
            reply.code(401).send({ error: 'Invalid API key' });
            return;
        }
    }
});
// Health check
fastify.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));
// Secure lead creation
fastify.post('/api/leads', async (req, reply) => {
    const body = req.body;
    // Validate required fields
    if (!body.phone) {
        reply.code(400).send({ error: 'Phone is required' });
        return;
    }
    // Validate phone format (Indian numbers)
    const phoneRegex = /^\+91[6-9]\d{9}$/;
    const phone = sanitize(body.phone);
    if (!phoneRegex.test(phone.replace(/[- ]/g, ''))) {
        reply.code(400).send({ error: 'Invalid phone number format' });
        return;
    }
    // Sanitize all inputs
    const name = sanitize(body.name || '');
    const email = body.email ? sanitize(body.email) : null;
    const source = sanitize(body.source || 'walk_in');
    // Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        reply.code(400).send({ error: 'Invalid email format' });
        return;
    }
    try {
        const result = await db_1.default.query(`
      INSERT INTO leads (name, phone, email, source, status, intent_score, intent_class)
      VALUES ($1, $2, $3, $4, 'new', 0, 'cold')
      RETURNING id, name, phone, status
    `, [name, phone, email, source]);
        reply.send({ success: true, data: result.rows[0] });
    }
    catch (e) {
        if (e.code === '23505') { // Unique violation
            reply.code(409).send({ error: 'Lead with this phone already exists' });
        }
        else {
            throw e;
        }
    }
});
// Secure webhook with signature verification
fastify.post('/webhook/meta', async (req, reply) => {
    const signature = req.headers['x-hub-signature-256'];
    const secret = process.env.META_APP_SECRET || '';
    // Verify signature
    const payload = JSON.stringify(req.body);
    if (!signature || !verifySignature(payload, signature, secret)) {
        reply.code(401).send({ error: 'Invalid signature' });
        return;
    }
    // Process webhook...
    reply.send({ success: true });
});
// Secure call recording endpoint
fastify.post('/api/calls', async (req, reply) => {
    const body = req.body;
    // Validate
    if (!body.lead_id || !body.recording_url) {
        reply.code(400).send({ error: 'Missing required fields' });
        return;
    }
    // Validate recording URL is from allowed storage
    const allowedDomains = (process.env.ALLOWED_STORAGE_DOMAINS || '').split(',');
    const url = new URL(body.recording_url);
    if (!allowedDomains.some(d => url.hostname.includes(d))) {
        reply.code(400).send({ error: 'Recording URL from unallowed domain' });
        return;
    }
    const result = await db_1.default.query(`
    INSERT INTO call_recordings (lead_id, visit_id, agent_id, call_type, recording_url, duration_seconds, call_purpose)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [body.lead_id, body.visit_id, body.agent_id, body.call_type, body.recording_url, body.duration_seconds, body.call_purpose]);
    reply.send({ success: true, data: result.rows[0] });
});
// Audit log endpoint
fastify.post('/api/audit', async (req, reply) => {
    const body = req.body;
    await db_1.default.query(`
    INSERT INTO interactions (lead_id, agent_id, type, summary)
    VALUES ($1, $2, 'system', $3)
  `, [body.lead_id, body.agent_id, `AUDIT: ${body.action} - ${body.details}`]);
    reply.send({ success: true });
});
const start = async () => {
    const port = Number(process.env.GATEWAY_PORT) || 4000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Secure API gateway on port ${port}`);
};
start().catch(console.error);
//# sourceMappingURL=index.js.map