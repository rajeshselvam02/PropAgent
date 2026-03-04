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
// WhatsApp webhook verification
fastify.get('/webhook/whatsapp', async (req, reply) => {
    const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        reply.send(challenge);
    }
    else {
        reply.code(403).send('Forbidden');
    }
});
// WhatsApp incoming messages
fastify.post('/webhook/whatsapp', async (req, reply) => {
    const payload = req.body;
    // Extract message
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (message) {
        const from = message.from;
        const text = message.text?.body || '';
        // Get or create lead
        const leadResult = await db_1.default.query('SELECT * FROM leads WHERE phone = $1', [from]);
        if (leadResult.rows.length === 0) {
            // Create new lead
            await db_1.default.query(`
        INSERT INTO leads (phone, source, status)
        VALUES ($1, 'whatsapp', 'new')
      `, [from]);
        }
        // Log message
        await db_1.default.query(`
      INSERT INTO whatsapp_messages (lead_id, direction, content, message_type, status)
      VALUES ((SELECT id FROM leads WHERE phone = $1), 'inbound', $2, 'text', 'received')
    `, [from, text]);
        // TODO: Process with qualification state machine
    }
    reply.send({ status: 'ok' });
});
// Send WhatsApp message (outbound)
fastify.post('/api/whatsapp/send', async (req, reply) => {
    const { phone, message } = req.body;
    // TODO: Integrate with Gupshup/Twilio API
    // For now, log it
    console.log(`Sending to ${phone}: ${message}`);
    await db_1.default.query(`
    INSERT INTO whatsapp_messages (lead_id, direction, content, message_type, status)
    VALUES ((SELECT id FROM leads WHERE phone = $1), 'outbound', $2, 'text', 'sent')
  `, [phone, message]);
    reply.send({ success: true });
});
// Health
fastify.get('/health', async () => ({ status: 'ok', service: 'whatsapp' }));
const start = async () => {
    const port = Number(process.env.WHATSAPP_PORT) || 4001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`WhatsApp service on port ${port}`);
};
start().catch(console.error);
//# sourceMappingURL=index.js.map