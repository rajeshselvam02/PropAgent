"use strict";
/**
 * WhatsApp Job Processor
 *
 * Handles sending WhatsApp messages via business API
 * Retry-safe: uses external message ID for deduplication
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWhatsAppSend = processWhatsAppSend;
exports.processQualificationStep = processQualificationStep;
exports.calculateIntentScore = calculateIntentScore;
const db_1 = __importDefault(require("@propagent/db"));
/**
 * Send a WhatsApp message
 */
async function processWhatsAppSend(job) {
    const { leadId, tenantId, to, message, templateName, templateParams, messageId } = job.data;
    console.log(`[whatsapp.send] Sending to ${to} for lead ${leadId}`);
    // Check for duplicate send (idempotency)
    if (messageId) {
        const existing = await db_1.default.query(`
      SELECT id, status FROM whatsapp_messages
      WHERE message_id = $1
    `, [messageId]);
        if (existing.rows.length > 0) {
            console.log(`[whatsapp.send] Duplicate message ${messageId}, skipping`);
            return { success: true, duplicate: true, existingId: existing.rows[0].id };
        }
    }
    // In production, call WhatsApp Business API (Gupshup/Twilio)
    // For now, we simulate and store
    const simulatedMessageId = messageId || `wa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // Store message record
    const result = await db_1.default.query(`
    INSERT INTO whatsapp_messages (
      lead_id, message_id, direction, message_type, content,
      template_name, template_params, status, sent_at
    ) VALUES ($1, $2, 'outbound', 'text', $3, $4, $5, 'sent', NOW())
    RETURNING id
  `, [
        leadId,
        simulatedMessageId,
        message,
        templateName || null,
        templateParams ? JSON.stringify(templateParams) : null,
    ]);
    // Log interaction
    await db_1.default.query(`
    INSERT INTO interactions (lead_id, type, summary, created_at)
    VALUES ($1, 'whatsapp', $2, NOW())
  `, [leadId, `WhatsApp sent: ${message.substring(0, 100)}...`]);
    // TODO: Actual API call to WhatsApp provider
    // try {
    //   const response = await whatsappClient.sendMessage({
    //     to,
    //     message,
    //     template: templateName,
    //     params: templateParams,
    //   });
    //   await db.query(`UPDATE whatsapp_messages SET status = 'delivered', delivered_at = NOW() WHERE id = $1`, [result.rows[0].id]);
    // } catch (error) {
    //   await db.query(`UPDATE whatsapp_messages SET status = 'failed' WHERE id = $1`, [result.rows[0].id]);
    //   throw error; // Let BullMQ handle retry
    // }
    return {
        success: true,
        messageId: simulatedMessageId,
        dbId: result.rows[0].id,
    };
}
/**
 * Process qualification step
 * Sends appropriate question based on lead's progress
 */
async function processQualificationStep(job) {
    const { leadId, tenantId, step, previousResponse } = job.data;
    console.log(`[whatsapp.qualification] Step ${step} for lead ${leadId}`);
    // Get lead info
    const leadResult = await db_1.default.query(`
    SELECT name, phone, qualification_responses, qualification_status
    FROM leads
    WHERE id = $1 AND tenant_id = $2
  `, [leadId, tenantId]);
    if (leadResult.rows.length === 0) {
        return { success: false, reason: 'lead_not_found' };
    }
    const lead = leadResult.rows[0];
    // Qualification questions
    const questions = [
        {
            field: 'budget',
            question: "What's your budget range?",
            options: ['₹40-60L', '₹60L-1Cr', '₹1Cr+'],
        },
        {
            field: 'timeline',
            question: "When are you planning to purchase?",
            options: ['ASAP', '3-6 months', 'Just exploring'],
        },
        {
            field: 'location',
            question: "Preferred location in Bangalore?",
            options: ['North', 'East', 'South', 'West'],
        },
        {
            field: 'purpose',
            question: "Is this for investment or self-use?",
            options: ['Investment', 'Self-use', 'Commercial'],
        },
    ];
    // Validate step
    if (step < 0 || step >= questions.length) {
        return { success: false, reason: 'invalid_step' };
    }
    // Process previous response if provided
    let updatedResponses = lead.qualification_responses || {};
    if (previousResponse && step > 0) {
        const prevQuestion = questions[step - 1];
        updatedResponses[prevQuestion.field] = previousResponse;
        // Store updated responses
        await db_1.default.query(`
      UPDATE leads 
      SET qualification_responses = $1
      WHERE id = $2
    `, [JSON.stringify(updatedResponses), leadId]);
    }
    // Send next question
    const currentQuestion = questions[step];
    const message = `${currentQuestion.question}\n\n${currentQuestion.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
    // Queue the WhatsApp send job
    // This will be picked up by the whatsapp processor
    return {
        success: true,
        nextMessage: message,
        step,
        totalSteps: questions.length,
        responses: updatedResponses,
    };
}
/**
 * Calculate intent score from qualification responses
 */
async function calculateIntentScore(leadId, responses) {
    let score = 0;
    // Budget (30 points)
    const budget = responses.budget;
    if (budget?.includes('1Cr'))
        score += 30;
    else if (budget?.includes('60L'))
        score += 20;
    else if (budget)
        score += 10;
    // Timeline (25 points)
    const timeline = responses.timeline;
    if (timeline === 'ASAP')
        score += 25;
    else if (timeline?.includes('3-6'))
        score += 15;
    else if (timeline)
        score += 5;
    // Location (20 points)
    if (responses.location)
        score += 20;
    // Purpose (15 points)
    const purpose = responses.purpose;
    if (purpose === 'Self-use')
        score += 15;
    else if (purpose === 'Investment')
        score += 12;
    else if (purpose)
        score += 8;
    // Classify
    const intentClass = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
    // Update lead
    await db_1.default.query(`
    UPDATE leads
    SET intent_score = $1,
        intent_class = $2,
        qualification_status = 'completed',
        qualification_completed_at = NOW()
    WHERE id = $3
  `, [score, intentClass, leadId]);
    return { score, intentClass };
}
//# sourceMappingURL=whatsapp.js.map