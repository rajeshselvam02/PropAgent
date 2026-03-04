/**
 * Dead Letter Queue Handler
 *
 * Provides visibility into failed jobs
 * Allows managers to inspect, requeue, or discard
 */
interface DLQEntry {
    id: string;
    tenantId: string;
    queue: string;
    jobName: string;
    payload: any;
    error: string;
    failedAt: Date;
    attempts: number;
}
/**
 * Log a failed job to DLQ table
 */
export declare function logToDLQ(entry: DLQEntry): Promise<string>;
/**
 * Get DLQ entries for a tenant
 */
export declare function getDLQEntries(tenantId: string, options?: {
    queue?: string;
    limit?: number;
    offset?: number;
}): Promise<{
    entries: any;
    total: number;
}>;
/**
 * Requeue a DLQ entry
 * Only managers/admins can do this
 */
export declare function requeueDLQEntry(dlqId: string, actorUserId: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Get DLQ stats for a tenant
 */
export declare function getDLQStats(tenantId: string): Promise<any>;
/**
 * Purge old DLQ entries (for cleanup job)
 */
export declare function purgeOldDLQEntries(olderThanDays?: number): Promise<number>;
export {};
//# sourceMappingURL=dlq.d.ts.map