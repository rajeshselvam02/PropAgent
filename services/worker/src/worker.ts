/**
 * Main Worker Entry Point
 * 
 * Starts all job processors and scheduler
 */

import { Worker, Job } from 'bullmq';
import dotenv from 'dotenv';
import { 
  QUEUE_NAMES, 
  JOB_TYPES, 
  RETRY_CONFIG, 
  REDIS_CONFIG,
  JobType,
} from './config';
import { closeAllQueues, followupsQueue, whatsappQueue, emailQueue, analyticsQueue, outboxQueue, maintenanceQueue } from './queues';

// Import processors
import { processScheduleFollowup, processRemindFollowup, checkOverdueFollowups } from './processors/followups';
import { processWhatsAppSend, processQualificationStep } from './processors/whatsapp';
import { processEmailSend } from './processors/email';
import { processAnalyticsRollup, processAgentPerformance } from './processors/analytics';
import { processOutboxPublish, pollUnpublishedEvents } from './processors/outbox';
import { logToDLQ } from './processors/dlq';
import {
  processCleanupIdempotencyKeys,
  processPurgeDLQ,
  processVacuum,
  processFullMaintenance
} from './processors/maintenance';

dotenv.config();

// Worker instances
const workers: Worker[] = [];

/**
 * Create a worker with error handling
 */
function createWorker(queueName: string, processor: (job: Job) => Promise<any>) {
  const worker = new Worker(queueName, processor, {
    connection: REDIS_CONFIG,
    concurrency: 5, // Process 5 jobs per worker concurrently
    limiter: {
      max: 100,     // Max 100 jobs
      duration: 1000, // Per second
    },
  });

  worker.on('completed', (job: Job) => {
    console.log(`[worker] Job ${job.id} (${job.name}) completed`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    if (!job) {
      console.error(`[worker] Job failed (no job object):`, err);
      return;
    }
    
    console.error(`[worker] Job ${job.id} (${job.name}) failed:`, err.message);
    
    // If max attempts reached, log to DLQ
    if (job.attemptsMade >= RETRY_CONFIG.attempts) {
      logToDLQ({
        id: job.id || 'unknown',
        tenantId: job.data.tenantId || 'unknown',
        queue: queueName,
        jobName: job.name,
        payload: job.data,
        error: err.message,
        failedAt: new Date(),
        attempts: job.attemptsMade,
      }).catch(e => console.error('[worker] Failed to log to DLQ:', e));
    }
  });

  worker.on('error', (err: Error) => {
    console.error(`[worker] Worker error on ${queueName}:`, err);
  });

  workers.push(worker);
  return worker;
}

/**
 * Start all workers
 */
async function startWorkers() {
  console.log('[worker] Starting workers...');

  // Follow-ups queue
  createWorker(QUEUE_NAMES.FOLLOWUPS, async (job: Job) => {
    switch (job.name as JobType) {
      case JOB_TYPES.FOLLOWUP_SCHEDULE:
        return processScheduleFollowup(job);
      case JOB_TYPES.FOLLOWUP_REMIND:
        return processRemindFollowup(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  });

  // WhatsApp queue
  createWorker(QUEUE_NAMES.WHATSAPP, async (job: Job) => {
    switch (job.name as JobType) {
      case JOB_TYPES.WHATSAPP_SEND:
        return processWhatsAppSend(job);
      case JOB_TYPES.WHATSAPP_QUALIFICATION:
        return processQualificationStep(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  });

  // Email queue
  createWorker(QUEUE_NAMES.EMAIL, async (job: Job) => {
    switch (job.name as JobType) {
      case JOB_TYPES.EMAIL_SEND:
        return processEmailSend(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  });

  // Analytics queue
  createWorker(QUEUE_NAMES.ANALYTICS, async (job: Job) => {
    switch (job.name as JobType) {
      case JOB_TYPES.ANALYTICS_ROLLUP:
        return processAnalyticsRollup(job);
      case JOB_TYPES.ANALYTICS_SNAPSHOT:
        return processAgentPerformance(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  });

  // Outbox queue
  createWorker(QUEUE_NAMES.OUTBOX, async (job: Job) => {
    switch (job.name as JobType) {
      case JOB_TYPES.OUTBOX_PUBLISH:
        return processOutboxPublish(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  });

  // Maintenance queue
  createWorker(QUEUE_NAMES.MAINTENANCE, async (job: Job) => {
    switch (job.name as JobType) {
      case JOB_TYPES.MAINTENANCE_CLEANUP:
        return processFullMaintenance(job);
      case JOB_TYPES.MAINTENANCE_REENCRYPT_PII:
        // Placeholder for PII re-encryption
        return { success: true, message: 'PII re-encryption not implemented yet' };
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  });

  console.log(`[worker] ${workers.length} workers started`);
}

/**
 * Scheduler - runs periodic jobs
 */
async function startScheduler() {
  console.log('[scheduler] Starting scheduler...');

  // Check for overdue follow-ups every minute
  setInterval(async () => {
    try {
      const overdue = await checkOverdueFollowups();
      for (const item of overdue) {
        await followupsQueue.add(JOB_TYPES.FOLLOWUP_REMIND, item, {
          jobId: `reminder-${item.leadId}`,
        });
      }
      if (overdue.length > 0) {
        console.log(`[scheduler] Queued ${overdue.length} overdue follow-up reminders`);
      }
    } catch (err) {
      console.error('[scheduler] Error checking overdue follow-ups:', err);
    }
  }, 60000);

  // Poll outbox for unpublished events every 5 seconds
  setInterval(async () => {
    try {
      const unpublished = await pollUnpublishedEvents(50);
      for (const eventId of unpublished) {
        await outboxQueue.add(JOB_TYPES.OUTBOX_PUBLISH, { eventId }, {
          jobId: `outbox-${eventId}`,
        });
      }
    } catch (err) {
      console.error('[scheduler] Error polling outbox:', err);
    }
  }, 5000);

  // Daily analytics rollup at 00:05
  const scheduleDailyRollup = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 5, 0, 0);
    const delay = tomorrow.getTime() - now.getTime();

    setTimeout(async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      await analyticsQueue.add(JOB_TYPES.ANALYTICS_ROLLUP, { date: dateStr });
      console.log(`[scheduler] Daily rollup queued for ${dateStr}`);
      
      // Schedule next run
      scheduleDailyRollup();
    }, delay);
  };
  
  scheduleDailyRollup();

  console.log('[scheduler] Scheduler started');
}

/**
 * Graceful shutdown
 */
async function shutdown(signal: string) {
  console.log(`[worker] Received ${signal}, shutting down...`);
  
  // Close all workers
  await Promise.all(workers.map(w => w.close()));
  
  // Close queues
  await closeAllQueues();
  
  console.log('[worker] Shutdown complete');
  process.exit(0);
}

// Main
async function main() {
  console.log('[worker] PropAgent Worker Service starting...');
  
  await startWorkers();
  await startScheduler();
  
  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  console.log('[worker] PropAgent Worker Service ready');
}

main().catch(err => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
