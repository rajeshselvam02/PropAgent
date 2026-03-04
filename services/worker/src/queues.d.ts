/**
 * BullMQ Queue Setup
 *
 * Creates queues with consistent retry policy and DLQ behavior
 */
import { Queue } from 'bullmq';
export declare const followupsQueue: Queue<any, any, string, any, any, string>;
export declare const notificationsQueue: Queue<any, any, string, any, any, string>;
export declare const whatsappQueue: Queue<any, any, string, any, any, string>;
export declare const emailQueue: Queue<any, any, string, any, any, string>;
export declare const maintenanceQueue: Queue<any, any, string, any, any, string>;
export declare const analyticsQueue: Queue<any, any, string, any, any, string>;
export declare const webhooksQueue: Queue<any, any, string, any, any, string>;
export declare const outboxQueue: Queue<any, any, string, any, any, string>;
export declare const queues: Map<"whatsapp" | "analytics" | "email" | "followups" | "notifications" | "maintenance" | "webhooks" | "outbox", Queue<any, any, string, any, any, string>>;
/**
 * Get queue by name
 */
export declare function getQueue(name: string): Queue | undefined;
/**
 * Close all queue connections (for graceful shutdown)
 */
export declare function closeAllQueues(): Promise<void>;
/**
 * Add a job to a queue with proper typing
 */
export declare function addJob(queueName: string, jobName: string, data: Record<string, any>, options?: {
    delay?: number;
    jobId?: string;
    priority?: number;
}): Promise<import("bullmq").Job<any, any, string>>;
//# sourceMappingURL=queues.d.ts.map