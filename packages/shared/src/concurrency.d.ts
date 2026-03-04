/**
 * Optimistic Concurrency Control
 *
 * Implements version-based optimistic locking for safe concurrent updates:
 * - Each record has a `version` field (integer, auto-incremented)
 * - UPDATE queries must include `WHERE version = $expected`
 * - Returns 409 Conflict on stale writes
 *
 * Usage:
 *   GET: Return ETag header with current version
 *   PUT: Check If-Match header, validate version, return 409 on mismatch
 */
import { FastifyRequest, FastifyReply } from 'fastify';
/**
 * Concurrency error codes
 */
export declare const CONFLICT_CODES: {
    readonly VERSION_MISMATCH: "VERSION_MISMATCH";
    readonly STALE_DATA: "STALE_DATA";
    readonly CONCURRENT_MODIFICATION: "CONCURRENT_MODIFICATION";
};
/**
 * Parse If-Match header to get expected version
 *
 * If-Match: "123" or If-Match: 123
 */
export declare function parseIfMatch(header: string | undefined): number | null;
/**
 * Format version for ETag header
 *
 * Returns quoted version string: "123"
 */
export declare function formatETag(version: number): string;
/**
 * Fastify middleware for optimistic concurrency
 *
 * Validates If-Match header against resource version
 */
export declare function concurrencyMiddleware(entityType: string, getVersion: (id: string, tenantId: string) => Promise<number | null>): (req: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
/**
 * Build UPDATE query with optimistic locking
 *
 * Returns: { query, params, rows, conflictHandling }
 */
export declare function buildVersionedUpdate(table: string, id: string, tenantId: string, expectedVersion: number, updates: Record<string, any>): {
    query: string;
    params: any[];
};
/**
 * Execute versioned update and handle conflicts
 */
export declare function executeVersionedUpdate(db: any, table: string, id: string, tenantId: string, expectedVersion: number, updates: Record<string, any>): Promise<{
    success: boolean;
    data?: any;
    conflict?: boolean;
}>;
/**
 * Add ETag header to GET response
 */
export declare function addETagHeader(reply: FastifyReply, version: number): void;
/**
 * Concurrency-aware GET handler
 *
 * Fetches entity and adds ETag header
 */
export declare function concurrencyAwareGet(db: any, table: string, id: string, tenantId: string, reply: FastifyReply): Promise<any | null>;
/**
 * Batch version check for bulk operations
 *
 * Returns map of id -> version mismatch error (if any)
 */
export declare function batchVersionCheck(db: any, table: string, updates: Array<{
    id: string;
    expectedVersion: number;
}>, tenantId: string): Promise<Map<string, {
    currentVersion: number;
    expectedVersion: number;
} | null>>;
//# sourceMappingURL=concurrency.d.ts.map