/**
 * Idempotency Middleware
 *
 * Implements idempotency for POST requests:
 * - Checks for existing key + body_hash combination
 * - Returns cached response for duplicates
 * - Stores new responses for future deduplication
 *
 * Usage:
 *   fastify.addHook('onRequest', idempotencyMiddleware);
 */
import { FastifyRequest, FastifyReply } from 'fastify';
/**
 * Generate SHA-256 hash of request body
 */
export declare function hashBody(body: any): string;
/**
 * Fastify middleware for idempotency checking
 *
 * Applies to POST requests with Idempotency-Key header
 */
export declare function idempotencyMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void>;
/**
 * Database-backed idempotency check (production version)
 *
 * Use this when you need persistent idempotency across restarts
 */
export declare function createDbIdempotencyMiddleware(db: any): Promise<(req: FastifyRequest, reply: FastifyReply) => Promise<void>>;
/**
 * Clean up expired idempotency keys (call periodically)
 */
export declare function cleanupExpiredKeys(db: any): Promise<number>;
/**
 * Generate idempotency key from request data
 * Useful for clients that don't provide explicit keys
 */
export declare function generateIdempotencyKey(prefix?: string): string;
//# sourceMappingURL=idempotency.d.ts.map