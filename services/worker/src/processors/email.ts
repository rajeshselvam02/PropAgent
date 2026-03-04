/**
 * Email Job Processor
 * 
 * Handles sending emails via SMTP/API
 */

import { Job } from 'bullmq';
import db from '@propagent/db';

interface EmailSendData {
  leadId?: string;
  tenantId?: string;
  to: string;
  subject: string;
  body: string;
  templateId?: string;
  templateData?: Record<string, any>;
  idempotencyKey?: string;
}

/**
 * Send an email
 */
export async function processEmailSend(job: Job<EmailSendData>) {
  const { leadId, tenantId, to, subject, body, templateId, templateData, idempotencyKey } = job.data;
  
  console.log(`[email.send] Sending to ${to}: ${subject}`);
  
  // Idempotency check
  if (idempotencyKey) {
    const existing = await db.query(`
      SELECT id FROM email_logs
      WHERE idempotency_key = $1
    `, [idempotencyKey]);
    
    if (existing.rows.length > 0) {
      return { success: true, duplicate: true };
    }
  }
  
  // In production, integrate with:
  // - SendGrid, Postmark, AWS SES, etc.
  // For now, simulate
  
  const messageId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Log email (if email_logs table exists, otherwise skip)
  try {
    await db.query(`
      INSERT INTO email_logs (id, lead_id, tenant_id, to_email, subject, status, sent_at, idempotency_key)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'sent', NOW(), $5)
    `, [leadId || null, tenantId || null, to, subject, idempotencyKey || null]);
  } catch (e) {
    // Table might not exist, continue
    console.log(`[email.send] Note: email_logs table not found, skipping log`);
  }
  
  // Log interaction if lead provided
  if (leadId) {
    await db.query(`
      INSERT INTO interactions (lead_id, type, summary, created_at)
      VALUES ($1, 'email', $2, NOW())
    `, [leadId, `Email sent: ${subject}`]);
  }
  
  // TODO: Actual email sending
  // await emailClient.send({
  //   to,
  //   subject,
  //   html: body,
  //   template: templateId,
  //   data: templateData,
  // });
  
  return {
    success: true,
    messageId,
    to,
    subject,
  };
}

/**
 * Email templates for common scenarios
 */
export const EMAIL_TEMPLATES = {
  WELCOME: {
    subject: 'Welcome to {{company_name}}',
    body: 'Hi {{name}}, thanks for your interest in {{project_name}}...',
  },
  VISIT_CONFIRMATION: {
    subject: 'Site Visit Confirmed - {{project_name}}',
    body: 'Your visit to {{project_name}} is confirmed for {{visit_date}}...',
  },
  VISIT_REMINDER: {
    subject: 'Reminder: Your Site Visit Tomorrow',
    body: 'Hi {{name}}, reminding you of your visit to {{project_name}}...',
  },
  FOLLOW_UP: {
    subject: 'Following up on your property search',
    body: 'Hi {{name}}, checking in on your interest in {{project_name}}...',
  },
};
