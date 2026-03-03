import Fastify from 'fastify';
import dotenv from 'dotenv';
import db from '@propagent/db';

dotenv.config();
const fastify = Fastify({ logger: true });

// WhatsApp webhook verification
fastify.get('/webhook/whatsapp', async (req, reply) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query as any;
  
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    reply.send(challenge);
  } else {
    reply.code(403).send('Forbidden');
  }
});

// WhatsApp incoming messages
fastify.post('/webhook/whatsapp', async (req, reply) => {
  const payload = req.body as any;
  
  // Extract message
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];
  
  if (message) {
    const from = message.from;
    const text = message.text?.body || '';
    
    // Get or create lead
    const leadResult = await db.query('SELECT * FROM leads WHERE phone = $1', [from]);
    
    if (leadResult.rows.length === 0) {
      // Create new lead
      await db.query(`
        INSERT INTO leads (phone, source, status)
        VALUES ($1, 'whatsapp', 'new')
      `, [from]);
    }
    
    // Log message
    await db.query(`
      INSERT INTO whatsapp_messages (lead_id, direction, content, message_type, status)
      VALUES ((SELECT id FROM leads WHERE phone = $1), 'inbound', $2, 'text', 'received')
    `, [from, text]);
    
    // TODO: Process with qualification state machine
  }
  
  reply.send({ status: 'ok' });
});

// Send WhatsApp message (outbound)
fastify.post('/api/whatsapp/send', async (req, reply) => {
  const { phone, message } = req.body as any;
  
  // TODO: Integrate with Gupshup/Twilio API
  // For now, log it
  console.log(`Sending to ${phone}: ${message}`);
  
  await db.query(`
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
