/**
 * Worker Configuration
 *
 * Retry policy: 8 attempts, exponential backoff (5s base, 10m cap)
 * All jobs must be idempotent - safe to retry
 */
export declare const QUEUE_NAMES: {
    readonly FOLLOWUPS: "followups";
    readonly NOTIFICATIONS: "notifications";
    readonly WHATSAPP: "whatsapp";
    readonly EMAIL: "email";
    readonly MAINTENANCE: "maintenance";
    readonly ANALYTICS: "analytics";
    readonly WEBHOOKS: "webhooks";
    readonly OUTBOX: "outbox";
};
export declare const JOB_TYPES: {
    readonly FOLLOWUP_SCHEDULE: "followup.schedule";
    readonly FOLLOWUP_REMIND: "followup.remind";
    readonly WHATSAPP_SEND: "whatsapp.send_message";
    readonly WHATSAPP_QUALIFICATION: "whatsapp.qualification_step";
    readonly EMAIL_SEND: "email.send";
    readonly MAINTENANCE_REENCRYPT_PII: "maintenance.reencrypt_pii";
    readonly MAINTENANCE_CLEANUP: "maintenance.cleanup";
    readonly ANALYTICS_ROLLUP: "analytics.compute_rollup";
    readonly ANALYTICS_SNAPSHOT: "analytics.daily_snapshot";
    readonly WEBHOOK_PROCESS_META: "webhook.process_meta";
    readonly WEBHOOK_PROCESS_PORTAL: "webhook.process_portal";
    readonly OUTBOX_PUBLISH: "outbox.publish";
};
export declare const RETRY_CONFIG: {
    attempts: number;
    backoff: {
        type: "exponential";
        delay: number;
    };
    maxBackoff: number;
};
export declare const JOB_TIMEOUTS: {
    WHATSAPP_SEND: number;
    EMAIL_SEND: number;
    WEBHOOK_PROCESS: number;
    ANALYTICS_ROLLUP: number;
    MAINTENANCE: number;
};
export declare const REDIS_CONFIG: {
    host: string;
    port: number;
    password: string | undefined;
    maxRetriesPerRequest: null;
};
export declare const DOMAIN_EVENTS: {
    readonly LEAD_CREATED: "lead.created";
    readonly LEAD_UPDATED: "lead.updated";
    readonly LEAD_ASSIGNED: "lead.assigned";
    readonly LEAD_STATUS_CHANGED: "lead.status_changed";
    readonly LEAD_SCORE_CALCULATED: "lead.score_calculated";
    readonly FOLLOWUP_SCHEDULED: "followup.scheduled";
    readonly FOLLOWUP_DUE: "followup.due";
    readonly FOLLOWUP_COMPLETED: "followup.completed";
    readonly VISIT_SCHEDULED: "visit.scheduled";
    readonly VISIT_COMPLETED: "visit.completed";
    readonly DEAL_CONVERTED: "deal.converted";
    readonly AUTH_LOGIN: "auth.login";
    readonly AUTH_LOGOUT: "auth.logout";
    readonly PII_KEY_ROTATED: "pii.key_rotated";
};
export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES];
export type DomainEvent = typeof DOMAIN_EVENTS[keyof typeof DOMAIN_EVENTS];
//# sourceMappingURL=config.d.ts.map