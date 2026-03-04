/**
 * Email Job Processor
 *
 * Handles sending emails via SMTP/API
 */
import { Job } from 'bullmq';
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
export declare function processEmailSend(job: Job<EmailSendData>): Promise<{
    success: boolean;
    duplicate: boolean;
    messageId?: undefined;
    to?: undefined;
    subject?: undefined;
} | {
    success: boolean;
    messageId: string;
    to: string;
    subject: string;
    duplicate?: undefined;
}>;
/**
 * Email templates for common scenarios
 */
export declare const EMAIL_TEMPLATES: {
    WELCOME: {
        subject: string;
        body: string;
    };
    VISIT_CONFIRMATION: {
        subject: string;
        body: string;
    };
    VISIT_REMINDER: {
        subject: string;
        body: string;
    };
    FOLLOW_UP: {
        subject: string;
        body: string;
    };
};
export {};
//# sourceMappingURL=email.d.ts.map