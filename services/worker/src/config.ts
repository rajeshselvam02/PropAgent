/**
 * Worker Configuration
 * 
 * Retry policy: 8 attempts, exponential backoff (5s base, 10m cap)
 * All jobs must be idempotent - safe to retry
 */

export const QUEUE_NAMES = {
  FOLLOWUPS: 'followups',
  NOTIFICATIONS: 'notifications',
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  MAINTENANCE: 'maintenance',
  ANALYTICS: 'analytics',
  WEBHOOKS: 'webhooks',
  OUTBOX: 'outbox',
} as const;

export const JOB_TYPES = {
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
} as const;

export const RETRY_CONFIG = {
  attempts: 8,
  backoff: {
    type: 'exponential' as const,
    delay: 5000, // 5s base
  },
  maxBackoff: 600000, // 10m cap
};

export const JOB_TIMEOUTS = {
  WHATSAPP_SEND: 30000,      // 30s
  EMAIL_SEND: 30000,         // 30s
  WEBHOOK_PROCESS: 60000,    // 1m
  ANALYTICS_ROLLUP: 300000,  // 5m
  MAINTENANCE: 600000,       // 10m
};

export const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // BullMQ requirement
};

// Event types for outbox
export const DOMAIN_EVENTS = {
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
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES];
export type DomainEvent = typeof DOMAIN_EVENTS[keyof typeof DOMAIN_EVENTS];
