"use strict";
/**
 * Worker Configuration
 *
 * Retry policy: 8 attempts, exponential backoff (5s base, 10m cap)
 * All jobs must be idempotent - safe to retry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOMAIN_EVENTS = exports.REDIS_CONFIG = exports.JOB_TIMEOUTS = exports.RETRY_CONFIG = exports.JOB_TYPES = exports.QUEUE_NAMES = void 0;
exports.QUEUE_NAMES = {
    FOLLOWUPS: 'followups',
    NOTIFICATIONS: 'notifications',
    WHATSAPP: 'whatsapp',
    EMAIL: 'email',
    MAINTENANCE: 'maintenance',
    ANALYTICS: 'analytics',
    WEBHOOKS: 'webhooks',
    OUTBOX: 'outbox',
};
exports.JOB_TYPES = {
    // Follow-ups
    FOLLOWUP_SCHEDULE: 'followup.schedule',
    FOLLOWUP_REMIND: 'followup.remind',
    // WhatsApp
    WHATSAPP_SEND: 'whatsapp.send_message',
    WHATSAPP_QUALIFICATION: 'whatsapp.qualification_step',
    // Email
    EMAIL_SEND: 'email.send',
    // Maintenance
    MAINTENANCE_REENCRYPT_PII: 'maintenance.reencrypt_pii',
    MAINTENANCE_CLEANUP: 'maintenance.cleanup',
    // Analytics
    ANALYTICS_ROLLUP: 'analytics.compute_rollup',
    ANALYTICS_SNAPSHOT: 'analytics.daily_snapshot',
    // Webhooks
    WEBHOOK_PROCESS_META: 'webhook.process_meta',
    WEBHOOK_PROCESS_PORTAL: 'webhook.process_portal',
    // Outbox
    OUTBOX_PUBLISH: 'outbox.publish',
};
exports.RETRY_CONFIG = {
    attempts: 8,
    backoff: {
        type: 'exponential',
        delay: 5000, // 5s base
    },
    maxBackoff: 600000, // 10m cap
};
exports.JOB_TIMEOUTS = {
    WHATSAPP_SEND: 30000, // 30s
    EMAIL_SEND: 30000, // 30s
    WEBHOOK_PROCESS: 60000, // 1m
    ANALYTICS_ROLLUP: 300000, // 5m
    MAINTENANCE: 600000, // 10m
};
exports.REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // BullMQ requirement
};
// Event types for outbox
exports.DOMAIN_EVENTS = {
    LEAD_CREATED: 'lead.created',
    LEAD_UPDATED: 'lead.updated',
    LEAD_ASSIGNED: 'lead.assigned',
    LEAD_STATUS_CHANGED: 'lead.status_changed',
    LEAD_SCORE_CALCULATED: 'lead.score_calculated',
    FOLLOWUP_SCHEDULED: 'followup.scheduled',
    FOLLOWUP_DUE: 'followup.due',
    FOLLOWUP_COMPLETED: 'followup.completed',
    VISIT_SCHEDULED: 'visit.scheduled',
    VISIT_COMPLETED: 'visit.completed',
    DEAL_CONVERTED: 'deal.converted',
    AUTH_LOGIN: 'auth.login',
    AUTH_LOGOUT: 'auth.logout',
    PII_KEY_ROTATED: 'pii.key_rotated',
};
//# sourceMappingURL=config.js.map