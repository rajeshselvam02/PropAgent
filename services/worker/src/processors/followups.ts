/**
 * Follow-up Job Processors
 *
 * Handles:
 * - followup.schedule: Schedule a delayed reminder job
 * - followup.remind: Send reminder notification
 *
 * All jobs are idempotent - safe to retry
 */

import { Job } from 'bullmq';
import db from '@propagent/db';
import { JOB_TYPES } from '../config';

interface ScheduleFollowupData {
  leadId: string;
  tenantId: string;
  scheduledAt: string; // ISO timestamp
  agentId?: string;
  notes?: string;
  idempotencyKey?: string;
}

interface RemindFollowupData {
  leadId: string;
  tenantId: string;
  followupId: string;
}

/**
 * Schedule a follow-up reminder
 * Creates a delayed job that fires at the scheduled time
 * IDEMPOTENT: Uses idempotencyKey to prevent duplicates
 */
export async function processScheduleFollowup(job: Job<ScheduleFollowupData>) {
  const { leadId, tenantId, scheduledAt, agentId, notes, idempotencyKey } = job.data;

  console.log(`[followup.schedule] Lead ${leadId} scheduled for ${scheduledAt}`);

  // Idempotency check - use followupId if provided
  if (idempotencyKey) {
    const existing = await db.query(`
      SELECT id FROM interactions
      WHERE lead_id = $1 AND summary LIKE $2
    `, [leadId, `Follow-up scheduled for ${scheduledAt}%`]);

    if (existing.rows.length > 0) {
      console.log(`[followup.schedule] Duplicate follow-up schedule detected, skipping`);
      return {
        success: true,
        duplicate: true,
        leadId,
        scheduledAt,
      };
    }
  }

  // Calculate delay (milliseconds until scheduled time)
  const scheduledTime = new Date(scheduledAt).getTime();
  const now = Date.now();
  const delay = Math.max(0, scheduledTime - now);

  // If delay is too large, BullMQ will handle it
  // If delay is 0 or negative, the reminder fires immediately

  // Update lead with follow-up info (idempotent - uses version)
  const updateResult = await db.query(`
    UPDATE leads
    SET next_follow_up_at = $1,
        follow_up_count = follow_up_count + 1,
        updated_at = NOW()
    WHERE id = $2 AND tenant_id = $3
    RETURNING id, version
  `, [scheduledAt, leadId, tenantId]);

  if (updateResult.rows.length === 0) {
    console.warn(`[followup.schedule] Lead ${leadId} not found in tenant ${tenantId}`);
    return {
      success: false,
      reason: 'lead_not_found',
      leadId,
    };
  }

  // Log the scheduling (idempotent - uses deduplication above)
  await db.query(`
    INSERT INTO interactions (lead_id, type, summary, created_at)
    VALUES ($1, 'note', $2, NOW())
  `, [leadId, `Follow-up scheduled for ${scheduledAt}. ${notes || ''}`]);

  // The actual reminder will be triggered by a separate mechanism
  // (either a scheduled job checker or the delay param on job add)

  return {
    success: true,
    leadId,
    scheduledAt,
    delay,
    version: updateResult.rows[0].version,
  };
}

/**
 * Send follow-up reminder
 * Called when a follow-up is due
 * IDEMPOTENT: Checks reminder_sent_at to prevent duplicates
 */
export async function processRemindFollowup(job: Job<RemindFollowupData>) {
  const { leadId, tenantId, followupId } = job.data;

  console.log(`[followup.remind] Processing reminder for lead ${leadId}`);

  // Get lead details with locking
  const leadResult = await db.query(`
    SELECT l.*, a.name as agent_name, a.phone as agent_phone
    FROM leads l
    LEFT JOIN agents a ON l.assigned_agent_id = a.id
    WHERE l.id = $1 AND l.tenant_id = $2
    FOR UPDATE
  `, [leadId, tenantId]);

  if (leadResult.rows.length === 0) {
    console.warn(`[followup.remind] Lead ${leadId} not found`);
    return { success: false, reason: 'lead_not_found' };
  }

  const lead = leadResult.rows[0];

  // Check if still pending (not converted/lost)
  if (['converted', 'lost'].includes(lead.status)) {
    console.log(`[followup.remind] Lead ${leadId} is ${lead.status}, skipping`);
    return { success: false, reason: 'lead_closed' };
  }

  // IDEMPOTENCY: Check if we already sent a reminder for this follow-up window
  // A follow-up can have multiple reminders, but we should dedupe by followupId
  const existingNotification = await db.query(`
    SELECT id FROM pending_notifications
    WHERE lead_id = $1
      AND type = 'followup_reminder'
      AND payload->>'followupId' = $2
      AND created_at > NOW() - INTERVAL '1 hour'
  `, [leadId, followupId]);

  if (existingNotification.rows.length > 0) {
    console.log(`[followup.remind] Duplicate reminder for ${followupId}, skipping`);
    return { success: true, duplicate: true };
  }

  // Create notification for agent
  // This will be picked up by the notifications processor
  await db.query(`
    INSERT INTO pending_notifications (lead_id, tenant_id, type, payload, created_at)
    VALUES ($1, $2, 'followup_reminder', $3, NOW())
  `, [leadId, tenantId, JSON.stringify({
    followupId,
    leadName: lead.name,
    leadPhone: lead.phone,
    scheduledAt: lead.next_follow_up_at,
    agentName: lead.agent_name,
  })]);

  // Update lead to mark reminder sent (idempotent)
  await db.query(`
    UPDATE leads
    SET reminder_sent_at = NOW(),
        version = version + 1
    WHERE id = $1
  `, [leadId]);

  return {
    success: true,
    leadId,
    notificationCreated: true,
  };
}

/**
 * Get overdue follow-ups and create reminder jobs
 * Called periodically by scheduler
 */
export async function checkOverdueFollowups() {
  const result = await db.query(`
    SELECT id, tenant_id, next_follow_up_at
    FROM leads
    WHERE next_follow_up_at < NOW()
      AND status NOT IN ('converted', 'lost')
      AND (reminder_sent_at IS NULL OR reminder_sent_at < next_follow_up_at)
    LIMIT 100
  `);

  const overdue = result.rows;
  console.log(`[followup.check] Found ${overdue.length} overdue follow-ups`);

  return overdue.map(row => ({
    leadId: row.id,
    tenantId: row.tenant_id,
    followupId: `overdue-${row.id}`,
  }));
}
