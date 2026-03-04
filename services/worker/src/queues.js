"use strict";
/**
 * BullMQ Queue Setup
 *
 * Creates queues with consistent retry policy and DLQ behavior
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.queues = exports.outboxQueue = exports.webhooksQueue = exports.analyticsQueue = exports.maintenanceQueue = exports.emailQueue = exports.whatsappQueue = exports.notificationsQueue = exports.followupsQueue = void 0;
exports.getQueue = getQueue;
exports.closeAllQueues = closeAllQueues;
exports.addJob = addJob;
const bullmq_1 = require("bullmq");
const config_1 = require("./config");
const queueOptions = {
    connection: config_1.REDIS_CONFIG,
    defaultJobOptions: {
        attempts: config_1.RETRY_CONFIG.attempts,
        backoff: config_1.RETRY_CONFIG.backoff,
        removeOnComplete: {
            count: 1000, // Keep last 1000 completed jobs
            age: 7 * 24 * 3600, // Or 7 days
        },
        removeOnFail: false, // Keep failed jobs for DLQ inspection
    },
};
// Create all queues
exports.followupsQueue = new bullmq_1.Queue(config_1.QUEUE_NAMES.FOLLOWUPS, queueOptions);
exports.notificationsQueue = new bullmq_1.Queue(config_1.QUEUE_NAMES.NOTIFICATIONS, queueOptions);
exports.whatsappQueue = new bullmq_1.Queue(config_1.QUEUE_NAMES.WHATSAPP, queueOptions);
exports.emailQueue = new bullmq_1.Queue(config_1.QUEUE_NAMES.EMAIL, queueOptions);
exports.maintenanceQueue = new bullmq_1.Queue(config_1.QUEUE_NAMES.MAINTENANCE, queueOptions);
exports.analyticsQueue = new bullmq_1.Queue(config_1.QUEUE_NAMES.ANALYTICS, queueOptions);
exports.webhooksQueue = new bullmq_1.Queue(config_1.QUEUE_NAMES.WEBHOOKS, queueOptions);
exports.outboxQueue = new bullmq_1.Queue(config_1.QUEUE_NAMES.OUTBOX, queueOptions);
// Map for easy access
exports.queues = new Map([
    [config_1.QUEUE_NAMES.FOLLOWUPS, exports.followupsQueue],
    [config_1.QUEUE_NAMES.NOTIFICATIONS, exports.notificationsQueue],
    [config_1.QUEUE_NAMES.WHATSAPP, exports.whatsappQueue],
    [config_1.QUEUE_NAMES.EMAIL, exports.emailQueue],
    [config_1.QUEUE_NAMES.MAINTENANCE, exports.maintenanceQueue],
    [config_1.QUEUE_NAMES.ANALYTICS, exports.analyticsQueue],
    [config_1.QUEUE_NAMES.WEBHOOKS, exports.webhooksQueue],
    [config_1.QUEUE_NAMES.OUTBOX, exports.outboxQueue],
]);
/**
 * Get queue by name
 */
function getQueue(name) {
    return exports.queues.get(name);
}
/**
 * Close all queue connections (for graceful shutdown)
 */
async function closeAllQueues() {
    await Promise.all(Array.from(exports.queues.values()).map(q => q.close()));
}
/**
 * Add a job to a queue with proper typing
 */
async function addJob(queueName, jobName, data, options) {
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
//# sourceMappingURL=queues.js.map