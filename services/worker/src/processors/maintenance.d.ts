/**
 * Maintenance Job Processor
 *
 * Handles periodic maintenance tasks:
 * - Cleanup expired idempotency keys
 * - Purge old DLQ entries
 * - Archive old logs
 */
import { Job } from 'bullmq';
interface CleanupData {
    olderThanDays?: number;
}
/**
 * Cleanup expired idempotency keys
 * IDEMPOTENT: Safe to run multiple times
 */
export declare function processCleanupIdempotencyKeys(job: Job<CleanupData>): Promise<{
    success: boolean;
    deletedCount: number | null;
    timestamp: string;
}>;
/**
 * Purge old DLQ entries
 * IDEMPOTENT: Safe to run multiple times
 */
export declare function processPurgeDLQ(job: Job<CleanupData>): Promise<{
    success: boolean;
    deletedCount: number | null;
    olderThanDays: number;
}>;
/**
 * Cleanup old interactions
 * Keeps last 90 days by default
 */
export declare function processCleanupInteractions(job: Job<CleanupData>): Promise<{
    success: boolean;
    deletedCount: number | null;
    olderThanDays: number;
}>;
/**
 * Vacuum and analyze tables
 * IDEMPOTENT: PostgreSQL VACUUM is safe to run multiple times
 */
export declare function processVacuum(job: Job): Promise<{
    success: boolean;
    tablesProcessed: number;
    timestamp: string;
}>;
/**
 * Reindex tables
 * Run weekly to maintain performance
 */
export declare function processReindex(job: Job): Promise<{
    success: boolean;
    indexesProcessed: number;
    timestamp: string;
}>;
/**
 * Run all maintenance tasks
 * Called by scheduler
 */
export declare function processFullMaintenance(job: Job): Promise<{
    success: boolean;
    results: Record<string, any>;
    timestamp: string;
}>;
export {};
//# sourceMappingURL=maintenance.d.ts.map