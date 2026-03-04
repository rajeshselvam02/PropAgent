/**
 * WhatsApp Job Processor
 *
 * Handles sending WhatsApp messages via business API
 * Retry-safe: uses external message ID for deduplication
 */
import { Job } from 'bullmq';
interface WhatsAppSendData {
    leadId: string;
    tenantId: string;
    to: string;
    message: string;
    templateName?: string;
    templateParams?: string[];
    messageId?: string;
}
interface QualificationStepData {
    leadId: string;
    tenantId: string;
    step: number;
    previousResponse?: string;
}
/**
 * Send a WhatsApp message
 */
export declare function processWhatsAppSend(job: Job<WhatsAppSendData>): Promise<{
    success: boolean;
    duplicate: boolean;
    existingId: any;
    messageId?: undefined;
    dbId?: undefined;
} | {
    success: boolean;
    messageId: string;
    dbId: any;
    duplicate?: undefined;
    existingId?: undefined;
}>;
/**
 * Process qualification step
 * Sends appropriate question based on lead's progress
 */
export declare function processQualificationStep(job: Job<QualificationStepData>): Promise<{
    success: boolean;
    reason: string;
    nextMessage?: undefined;
    step?: undefined;
    totalSteps?: undefined;
    responses?: undefined;
} | {
    success: boolean;
    nextMessage: string;
    step: number;
    totalSteps: number;
    responses: any;
    reason?: undefined;
}>;
/**
 * Calculate intent score from qualification responses
 */
export declare function calculateIntentScore(leadId: string, responses: Record<string, string>): Promise<{
    score: number;
    intentClass: string;
}>;
export {};
//# sourceMappingURL=whatsapp.d.ts.map