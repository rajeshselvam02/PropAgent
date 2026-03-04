"use strict";
/**
 * Dead Letter Queue Handler
 *
 * Provides visibility into failed jobs
 * Allows managers to inspect, requeue, or discard
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logToDLQ = logToDLQ;
exports.getDLQEntries = getDLQEntries;
exports.requeueDLQEntry = requeueDLQEntry;
exports.getDLQStats = getDLQStats;
exports.purgeOldDLQEntries = purgeOldDLQEntries;
const db_1 = __importDefault(require("@propagent/db"));
/**
 * Log a failed job to DLQ table
 */
async function logToDLQ(entry) {
    const result = await db_1.default.query(`
    INSERT INTO dead_letters (
      tenant_id, queue, job_name, payload, error, failed_at, attempts
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [
        entry.tenantId,
        entry.queue,
        entry.jobName,
        JSON.stringify(entry.payload),
        entry.error,
        entry.failedAt,
        entry.attempts,
    ]);
    return result.rows[0].id;
}
/**
 * Get DLQ entries for a tenant
 */
async function getDLQEntries(tenantId, options) {
    const { queue, limit = 50, offset = 0 } = options || {};
    let query = `
    SELECT * FROM dead_letters
    WHERE tenant_id = $1 AND requeued_at IS NULL
  `;
    const params = [tenantId];
    if (queue) {
        params.push(queue);
        query += ` AND queue = $${params.length}`;
    }
    query += ` ORDER BY failed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await db_1.default.query(query, params);
    // Get total count
    const countResult = await db_1.default.query(`
    SELECT COUNT(*) FROM dead_letters
    WHERE tenant_id = $1 AND requeued_at IS NULL
  `, [tenantId]);
    return {
        entries: result.rows,
        total: parseInt(countResult.rows[0].count),
    };
}
/**
 * Requeue a DLQ entry
 * Only managers/admins can do this
 */
async function requeueDLQEntry(dlqId, actorUserId) {
    // Get entry
    const entryResult = await db_1.default.query(`
    SELECT * FROM dead_letters WHERE id = $1 AND requeued_at IS NULL
  `, [dlqId]);
    if (entryResult.rows.length === 0) {
        return { success: false, error: 'Entry not found or already requeued' };
    }
    const entry = entryResult.rows[0];
    // Mark as requeued
    await db_1.default.query(`
    UPDATE dead_letters
    SET requeued_at = NOW()
    WHERE id = $1
  `, [dlqId]);
    // Log audit
    await db_1.default.query(`
    INSERT INTO audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id, metadata
    ) VALUES ($1, $2, 'dlq_requeue', 'dead_letter', $3, $4)
  `, [
        entry.tenant_id,
        actorUserId,
        dlqId,
        JSON.stringify({ queue: entry.queue, job_name: entry.job_name }),
    ]);
    // Return job data for re-queueing
    // The caller (API) will need to add the job back to the queue
    return {
        success: true,
    };
}
/**
 * Get DLQ stats for a tenant
 */
async function getDLQStats(tenantId) {
    const result = await db_1.default.query(`
    SELECT 
      queue,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE failed_at > NOW() - INTERVAL '24 hours') as last_24h,
      COUNT(*) FILTER (WHERE failed_at > NOW() - INTERVAL '7 days') as last_7d
    FROM dead_letters
    WHERE tenant_id = $1 AND requeued_at IS NULL
    GROUP BY queue
    ORDER BY count DESC
  `, [tenantId]);
    return result.rows;
}
/**
 * Purge old DLQ entries (for cleanup job)
 */
async function purgeOldDLQEntries(olderThanDays = 30) {
    const result = await db_1.default.query(`
    DELETE FROM dead_letters
    WHERE failed_at < NOW() - INTERVAL '${olderThanDays} days'
    RETURNING id
  `);
    return result.rows.length;
}
//# sourceMappingURL=dlq.js.map