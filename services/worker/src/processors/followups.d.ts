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
interface ScheduleFollowupData {
    leadId: string;
    tenantId: string;
    scheduledAt: string;
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
export declare function processScheduleFollowup(job: Job<ScheduleFollowupData>): Promise<{
    success: boolean;
    duplicate: boolean;
    leadId: string;
    scheduledAt: string;
    reason?: undefined;
    delay?: undefined;
    version?: undefined;
} | {
    success: boolean;
    reason: string;
    leadId: string;
    duplicate?: undefined;
    scheduledAt?: undefined;
    delay?: undefined;
    version?: undefined;
} | {
    success: boolean;
    leadId: string;
    scheduledAt: string;
    delay: number;
    version: any;
    duplicate?: undefined;
    reason?: undefined;
}>;
/**
 * Send follow-up reminder
 * Called when a follow-up is due
 * IDEMPOTENT: Checks reminder_sent_at to prevent duplicates
 */
export declare function processRemindFollowup(job: Job<RemindFollowupData>): Promise<{
    success: boolean;
    reason: string;
    duplicate?: undefined;
    leadId?: undefined;
    notificationCreated?: undefined;
} | {
    success: boolean;
    duplicate: boolean;
    reason?: undefined;
    leadId?: undefined;
    notificationCreated?: undefined;
} | {
    success: boolean;
    leadId: string;
    notificationCreated: boolean;
    reason?: undefined;
    duplicate?: undefined;
}>;
/**
 * Get overdue follow-ups and create reminder jobs
 * Called periodically by scheduler
 */
export declare function checkOverdueFollowups(): Promise<any>;
export {};
//# sourceMappingURL=followups.d.ts.map