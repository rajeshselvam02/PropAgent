"use strict";
/**
 * Main Worker Entry Point
 *
 * Starts all job processors and scheduler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const dotenv_1 = __importDefault(require("dotenv"));
const config_1 = require("./config");
const queues_1 = require("./queues");
// Import processors
const followups_1 = require("./processors/followups");
const whatsapp_1 = require("./processors/whatsapp");
const email_1 = require("./processors/email");
const analytics_1 = require("./processors/analytics");
const outbox_1 = require("./processors/outbox");
const dlq_1 = require("./processors/dlq");
dotenv_1.default.config();
// Worker instances
const workers = [];
/**
 * Create a worker with error handling
 */
function createWorker(queueName, processor) {
    const worker = new bullmq_1.Worker(queueName, processor, {
        connection: config_1.REDIS_CONFIG,
        concurrency: 5, // Process 5 jobs per worker concurrently
        limiter: {
            max: 100, // Max 100 jobs
            duration: 1000, // Per second
        },
    });
    worker.on('completed', (job) => {
        console.log(`[worker] Job ${job.id} (${job.name}) completed`);
    });
    worker.on('failed', (job, err) => {
        if (!job) {
            console.error(`[worker] Job failed (no job object):`, err);
            return;
        }
        console.error(`[worker] Job ${job.id} (${job.name}) failed:`, err.message);
        // If max attempts reached, log to DLQ
        if (job.attemptsMade >= config_1.RETRY_CONFIG.attempts) {
            (0, dlq_1.logToDLQ)({
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
    worker.on('error', (err) => {
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
    createWorker(config_1.QUEUE_NAMES.FOLLOWUPS, async (job) => {
        switch (job.name) {
            case config_1.JOB_TYPES.FOLLOWUP_SCHEDULE:
                return (0, followups_1.processScheduleFollowup)(job);
            case config_1.JOB_TYPES.FOLLOWUP_REMIND:
                return (0, followups_1.processRemindFollowup)(job);
            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
    });
    // WhatsApp queue
    createWorker(config_1.QUEUE_NAMES.WHATSAPP, async (job) => {
        switch (job.name) {
            case config_1.JOB_TYPES.WHATSAPP_SEND:
                return (0, whatsapp_1.processWhatsAppSend)(job);
            case config_1.JOB_TYPES.WHATSAPP_QUALIFICATION:
                return (0, whatsapp_1.processQualificationStep)(job);
            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
    });
    // Email queue
    createWorker(config_1.QUEUE_NAMES.EMAIL, async (job) => {
        switch (job.name) {
            case config_1.JOB_TYPES.EMAIL_SEND:
                return (0, email_1.processEmailSend)(job);
            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
    });
    // Analytics queue
    createWorker(config_1.QUEUE_NAMES.ANALYTICS, async (job) => {
        switch (job.name) {
            case config_1.JOB_TYPES.ANALYTICS_ROLLUP:
                return (0, analytics_1.processAnalyticsRollup)(job);
            case config_1.JOB_TYPES.ANALYTICS_SNAPSHOT:
                return (0, analytics_1.processAgentPerformance)(job);
            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
    });
    // Outbox queue
    createWorker(config_1.QUEUE_NAMES.OUTBOX, async (job) => {
        switch (job.name) {
            case config_1.JOB_TYPES.OUTBOX_PUBLISH:
                return (0, outbox_1.processOutboxPublish)(job);
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
            const overdue = await (0, followups_1.checkOverdueFollowups)();
            for (const item of overdue) {
                await queues_1.followupsQueue.add(config_1.JOB_TYPES.FOLLOWUP_REMIND, item, {
                    jobId: `reminder-${item.leadId}`,
                });
            }
            if (overdue.length > 0) {
                console.log(`[scheduler] Queued ${overdue.length} overdue follow-up reminders`);
            }
        }
        catch (err) {
            console.error('[scheduler] Error checking overdue follow-ups:', err);
        }
    }, 60000);
    // Poll outbox for unpublished events every 5 seconds
    setInterval(async () => {
        try {
            const unpublished = await (0, outbox_1.pollUnpublishedEvents)(50);
            for (const eventId of unpublished) {
                await queues_1.outboxQueue.add(config_1.JOB_TYPES.OUTBOX_PUBLISH, { eventId }, {
                    jobId: `outbox-${eventId}`,
                });
            }
        }
        catch (err) {
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
            await queues_1.analyticsQueue.add(config_1.JOB_TYPES.ANALYTICS_ROLLUP, { date: dateStr });
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
async function shutdown(signal) {
    console.log(`[worker] Received ${signal}, shutting down...`);
    // Close all workers
    await Promise.all(workers.map(w => w.close()));
    // Close queues
    await (0, queues_1.closeAllQueues)();
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
//# sourceMappingURL=worker.js.map