/**
 * BullMQ Queue Setup
 * 
 * Creates queues with consistent retry policy and DLQ behavior
 */

import { Queue, QueueOptions } from 'bullmq';
import { QUEUE_NAMES, RETRY_CONFIG, REDIS_CONFIG } from './config';

const queueOptions: QueueOptions = {
  connection: REDIS_CONFIG,
  defaultJobOptions: {
    attempts: RETRY_CONFIG.attempts,
    backoff: RETRY_CONFIG.backoff,
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 7 * 24 * 3600, // Or 7 days
    },
    removeOnFail: false, // Keep failed jobs for DLQ inspection
  },
};

// Create all queues
export const followupsQueue = new Queue(QUEUE_NAMES.FOLLOWUPS, queueOptions);
export const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, queueOptions);
export const whatsappQueue = new Queue(QUEUE_NAMES.WHATSAPP, queueOptions);
export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, queueOptions);
export const maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, queueOptions);
export const analyticsQueue = new Queue(QUEUE_NAMES.ANALYTICS, queueOptions);
export const webhooksQueue = new Queue(QUEUE_NAMES.WEBHOOKS, queueOptions);
export const outboxQueue = new Queue(QUEUE_NAMES.OUTBOX, queueOptions);

// Map for easy access
export const queues = new Map([
  [QUEUE_NAMES.FOLLOWUPS, followupsQueue],
  [QUEUE_NAMES.NOTIFICATIONS, notificationsQueue],
  [QUEUE_NAMES.WHATSAPP, whatsappQueue],
  [QUEUE_NAMES.EMAIL, emailQueue],
  [QUEUE_NAMES.MAINTENANCE, maintenanceQueue],
  [QUEUE_NAMES.ANALYTICS, analyticsQueue],
  [QUEUE_NAMES.WEBHOOKS, webhooksQueue],
  [QUEUE_NAMES.OUTBOX, outboxQueue],
]);

/**
 * Get queue by name
 */
export function getQueue(name: string): Queue | undefined {
  return queues.get(name as any);
}

/**
 * Close all queue connections (for graceful shutdown)
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all(Array.from(queues.values()).map(q => q.close()));
}

/**
 * Add a job to a queue with proper typing
 */
export async function addJob(
  queueName: string,
  jobName: string,
  data: Record<string, any>,
  options?: {
    delay?: number;
    jobId?: string;
    priority?: number;
  }
) {
  const queue = getQueue(queueName);
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }
  
  return queue.add(jobName, data, {
    jobId: options?.jobId,
    delay: options?.delay,
    priority: options?.priority,
  });
}
