"use strict";
/**
 * Maintenance Job Processor
 *
 * Handles periodic maintenance tasks:
 * - Cleanup expired idempotency keys
 * - Purge old DLQ entries
 * - Archive old logs
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCleanupIdempotencyKeys = processCleanupIdempotencyKeys;
exports.processPurgeDLQ = processPurgeDLQ;
exports.processCleanupInteractions = processCleanupInteractions;
exports.processVacuum = processVacuum;
exports.processReindex = processReindex;
exports.processFullMaintenance = processFullMaintenance;
const db_1 = __importDefault(require("@propagent/db"));
/**
 * Cleanup expired idempotency keys
 * IDEMPOTENT: Safe to run multiple times
 */
async function processCleanupIdempotencyKeys(job) {
    console.log('[maintenance] Cleaning up expired idempotency keys');
    const result = await db_1.default.query(`
    DELETE FROM idempotency_keys
    WHERE expires_at < NOW()
    RETURNING id
  `);
    console.log(`[maintenance] Deleted ${result.rowCount} expired idempotency keys`);
    return {
        success: true,
        deletedCount: result.rowCount,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Purge old DLQ entries
 * IDEMPOTENT: Safe to run multiple times
 */
async function processPurgeDLQ(job) {
    const { olderThanDays = 30 } = job.data || {};
    console.log(`[maintenance] Purging DLQ entries older than ${olderThanDays} days`);
    const result = await db_1.default.query(`
    DELETE FROM dead_letters
    WHERE failed_at < NOW() - INTERVAL '${olderThanDays} days'
    RETURNING id
  `);
    console.log(`[maintenance] Purged ${result.rowCount} old DLQ entries`);
    return {
        success: true,
        deletedCount: result.rowCount,
        olderThanDays,
    };
}
/**
 * Cleanup old interactions
 * Keeps last 90 days by default
 */
async function processCleanupInteractions(job) {
    const { olderThanDays = 90 } = job.data || {};
    console.log(`[maintenance] Cleaning up interactions older than ${olderThanDays} days`);
    const result = await db_1.default.query(`
    DELETE FROM interactions
    WHERE created_at < NOW() - INTERVAL '${olderThanDays} days'
    RETURNING id
  `);
    console.log(`[maintenance] Deleted ${result.rowCount} old interactions`);
    return {
        success: true,
        deletedCount: result.rowCount,
        olderThanDays,
    };
}
/**
 * Vacuum and analyze tables
 * IDEMPOTENT: PostgreSQL VACUUM is safe to run multiple times
 */
async function processVacuum(job) {
    console.log('[maintenance] Running VACUUM ANALYZE on key tables');
    const tables = [
        'leads',
        'interactions',
        'outbox_events',
        'domain_events',
        'idempotency_keys',
        'dead_letters',
        'email_logs',
        'whatsapp_messages',
    ];
    for (const table of tables) {
        try {
            await db_1.default.query(`VACUUM ANALYZE ${table}`);
            console.log(`[maintenance] VACUUM ANALYZE ${table} complete`);
        }
        catch (err) {
            console.error(`[maintenance] VACUUM failed for ${table}:`, err);
            // Continue with other tables
        }
    }
    return {
        success: true,
        tablesProcessed: tables.length,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Reindex tables
 * Run weekly to maintain performance
 */
async function processReindex(job) {
    console.log('[maintenance] Running REINDEX on key indexes');
    const indexes = [
        'idx_leads_tenant',
        'idx_leads_phone_hash',
        'idx_leads_email_hash',
        'idx_idempotency_tenant_key',
        'idx_outbox_unpublished',
    ];
    for (const index of indexes) {
        try {
            await db_1.default.query(`REINDEX INDEX ${index}`);
            console.log(`[maintenance] Reindexed ${index}`);
        }
        catch (err) {
            console.error(`[maintenance] Reindex failed for ${index}:`, err);
            // Continue with other indexes
        }
    }
    return {
        success: true,
        indexesProcessed: indexes.length,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Run all maintenance tasks
 * Called by scheduler
 */
async function processFullMaintenance(job) {
    console.log('[maintenance] Running full maintenance suite');
    const results = {};
    // Cleanup idempotency keys
    results.idempotencyKeys = await processCleanupIdempotencyKeys(job);
    // Purge old DLQ entries (30 days)
    results.dlq = await processPurgeDLQ({ data: { olderThanDays: 30 } });
    // Cleanup old interactions (90 days)
    results.interactions = await processCleanupInteractions({ data: { olderThanDays: 90 } });
    // Vacuum
    results.vacuum = await processVacuum(job);
    return {
        success: true,
        results,
        timestamp: new Date().toISOString(),
    };
}
//# sourceMappingURL=maintenance.js.map