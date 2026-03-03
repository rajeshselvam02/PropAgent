import Fastify from 'fastify';
import dotenv from 'dotenv';
import db from '@propagent/db';

dotenv.config();
const fastify = Fastify({ logger: true });

// Qualification State Machine
interface QualificationState {
  leadId: string;
  phone: string;
  currentState: 'welcome' | 'budget' | 'timeline' | 'location' | 'purpose' | 'qualified';
  responses: {
    budget?: string;
    timeline?: string;
    location?: string;
    purpose?: string;
  };
  intentScore: number;
}

const qualificationSessions = new Map<string, QualificationState>();

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
  
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];
  
  if (message) {
    const from = message.from;
    const text = message.text?.body?.trim().toLowerCase();
    
    // Process with state machine
    const response = await processMessage(from, text);
    
    // Send response via WhatsApp API
    if (response) {
      await sendWhatsAppMessage(from, response);
    }
  }
  
  reply.send({ status: 'ok' });
});

// Process message through state machine
async function processMessage(phone: string, text: string): Promise<string | null> {
  let session = qualificationSessions.get(phone);
  
  // New conversation
  if (!session) {
    // Check if lead exists
    const leadResult = await db.query('SELECT * FROM leads WHERE phone = $1', [phone]);
    
    if (leadResult.rows.length === 0) {
      // Create new lead
      await db.query(`
        INSERT INTO leads (phone, source, status, intent_class, intent_score)
        VALUES ($1, 'whatsapp', 'new', 'cold', 0)
      `, [phone]);
    }
    
    const leadId = leadResult.rows[0]?.id || (await db.query('SELECT id FROM leads WHERE phone = $1', [phone])).rows[0].id;
    
    session = {
      leadId,
      phone,
      currentState: 'welcome',
      responses: {},
      intentScore: 0
    };
    qualificationSessions.set(phone, session);
    
    return getWelcomeMessage();
  }
  
  // Process based on current state
  switch (session.currentState) {
    case 'welcome':
      return getBudgetQuestion();
    case 'budget':
      session.responses.budget = text;
      session.intentScore += 20;
      session.currentState = 'timeline';
      return getTimelineQuestion();
    case 'timeline':
      session.responses.timeline = text;
      if (text.includes('asap') || text.includes('1-3')) session.intentScore += 30;
      else if (text.includes('3-6')) session.intentScore += 15;
      session.currentState = 'location';
      return getLocationQuestion();
    case 'location':
      session.responses.location = text;
      session.intentScore += 15;
      session.currentState = 'purpose';
      return getPurposeQuestion();
    case 'purpose':
      session.responses.purpose = text;
      session.intentScore += 15;
      session.currentState = 'qualified';
      return await completeQualification(session);
    default:
      return null;
  }
}

function getWelcomeMessage(): string {
  return `Hi! 👋

Thanks for your interest in our properties.

I'm here to help you find your perfect property. Let me ask a few quick questions to understand your needs better.

What's your budget range?

[1] ₹40-60 Lakhs
[2] ₹60 Lakhs - 1 Crore
[3] ₹1 Crore - 2 Crore
[4] ₹2 Crore+

Reply with the number or type your budget.`;
}

function getBudgetQuestion(): string {
  return `Great! When are you planning to buy?

[1] ASAP (within 1 month)
[2] 1-3 months
[3] 3-6 months
[4] Just exploring

Reply with the number.`;
}

function getTimelineQuestion(): string {
  return `Perfect! Which location do you prefer in Bangalore?

[1] North (Devanahalli, Yelahanka)
[2] East (Whitefield, Sarjapur)
[3] South (Electronic City, HSR)
[4] West (Kengeri, Magadi Road)
[5] Any location

Reply with the number.`;
}

function getLocationQuestion(): string {
  return `Almost done! What's the purpose?

[1] Investment
[2] Self-use
[3] Commercial

Reply with the number.`;
}

async function completeQualification(session: QualificationState): Promise<string> {
  // Update lead in database
  const intentClass = session.intentScore >= 70 ? 'hot' : session.intentScore >= 40 ? 'warm' : 'cold';
  
  await db.query(`
    UPDATE leads 
    SET status = 'qualified',
        intent_score = $1,
        intent_class = $2,
        qualification_status = 'completed',
        qualification_completed_at = NOW(),
        qualification_responses = $3,
        budget_range = $4,
        timeline = $5,
        preferred_location = $6,
        purpose = $7
    WHERE id = $8
  `, [
    session.intentScore,
    intentClass,
    JSON.stringify(session.responses),
    session.responses.budget,
    session.responses.timeline,
    session.responses.location,
    session.responses.purpose,
    session.leadId
  ]);
  
  // Clear session
  qualificationSessions.delete(session.phone);
  
  if (intentClass === 'hot') {
    return `🎉 Great news! You're a priority lead.

Based on your preferences:
• Budget: ${session.responses.budget}
• Timeline: ${session.responses.timeline}
• Location: ${session.responses.location}

Our senior advisor will call you within 5 minutes to discuss site visit options.

Is now a good time to talk? [Yes] [Call me later]`;
  } else if (intentClass === 'warm') {
    return `Thanks for the information! 

We have some great options matching your preferences.

Our team will reach out within 24 hours to schedule a site visit.

In the meantime, feel free to ask any questions here!`;
  } else {
    return `Thanks for your interest! 

We'll keep you updated on new properties matching your preferences.

Feel free to message us anytime if you have questions.`;
  }
}

// Send WhatsApp message via API
async function sendWhatsAppMessage(to: string, message: string): Promise<void> {
  // In production, integrate with Gupshup/Twilio/Interakt
  console.log(`[WhatsApp] To: ${to}\n${message}\n---`);
  
  // Log message
  await db.query(`
    INSERT INTO whatsapp_messages (lead_id, direction, content, message_type, status)
    VALUES ((SELECT id FROM leads WHERE phone = $1), 'outbound', $2, 'text', 'sent')
  `, [to, message]);
}

// Manual send endpoint
fastify.post('/api/whatsapp/send', async (req, reply) => {
  const { phone, message } = req.body as any;
  await sendWhatsAppMessage(phone, message);
  reply.send({ success: true });
});

// Health
fastify.get('/health', async () => ({ status: 'ok', service: 'whatsapp-qualification' }));

const start = async () => {
  const port = Number(process.env.WHATSAPP_PORT) || 4001;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`WhatsApp qualification service on port ${port}`);
};

start().catch(console.error);
