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
import crypto from 'crypto';

// Cache entry structure
interface CachedResponse {
  statusCode: number;
  body: any;
  createdAt: Date;
}

// In-memory cache for testing/development (use Redis in production)
const responseCache = new Map<string, CachedResponse>();

// Default TTL: 24 hours
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Generate SHA-256 hash of request body
 */
export function hashBody(body: any): string {
  if (!body) return 'empty';
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto.createHash('sha256').update(bodyString).digest('hex');
}

/**
 * Build cache key from tenant + idempotency key
 */
function buildCacheKey(tenantId: string, idempotencyKey: string): string {
  return `${tenantId}:${idempotencyKey}`;
}

/**
 * Check if cache entry is expired
 */
function isExpired(entry: CachedResponse): boolean {
  return Date.now() - entry.createdAt.getTime() > DEFAULT_TTL_MS;
}

/**
 * Fastify middleware for idempotency checking
 *
 * Applies to POST requests with Idempotency-Key header
 */
export async function idempotencyMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to POST requests
  if (req.method !== 'POST') return;

  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) return;

  // Validate key format (alphanumeric, dash, underscore, max 255 chars)
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(idempotencyKey)) {
    reply.code(400).send({ error: 'Invalid Idempotency-Key format' });
    return;
  }

  // Get tenant from user context (set by auth middleware)
  const tenantId = req.user?.tenant_id;
  if (!tenantId) {
    // Cannot enforce idempotency without tenant context
    return;
  }

  const bodyHash = hashBody(req.body);
  const cacheKey = buildCacheKey(tenantId, idempotencyKey);

  // Check for cached response
  const cached = responseCache.get(cacheKey);
  
  if (cached) {
    // Check if expired
    if (isExpired(cached)) {
      responseCache.delete(cacheKey);
      return; // Proceed with new request
    }

    // Check body hash match (prevent key reuse with different payloads)
    const existingHash = hashBody(cached.body);
    if (existingHash !== bodyHash) {
      reply.code(409).send({
        error: 'Idempotency key already used with different payload',
        code: 'IDEMPOTENCY_KEY_CONFLICT'
      });
      return;
    }

    // Return cached response
    req.log.info({ idempotencyKey, cacheKey }, 'Returning cached idempotent response');
    reply.code(cached.statusCode).header('X-Idempotent-Replayed', 'true');
    reply.send(cached.body);
    return;
  }

  // Store original send function to intercept response
  const originalSend = reply.send.bind(reply);
  
  reply.send = function(payload: any): FastifyReply {
    // Store response for future requests
    const statusCode = reply.statusCode;
    
    responseCache.set(cacheKey, {
      statusCode,
      body: payload,
      createdAt: new Date()
    });

    req.log.info({ idempotencyKey, cacheKey, statusCode }, 'Cached idempotent response');
    
    // Call original send
    return originalSend(payload);
  };
}

/**
 * Database-backed idempotency check (production version)
 * 
 * Use this when you need persistent idempotency across restarts
 */
export async function createDbIdempotencyMiddleware(db: any) {
  return async function dbIdempotencyMiddleware(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (req.method !== 'POST') return;

    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) return;

    if (!/^[a-zA-Z0-9_-]{1,255}$/.test(idempotencyKey)) {
      reply.code(400).send({ error: 'Invalid Idempotency-Key format' });
      return;
    }

    const tenantId = req.user?.tenant_id;
    if (!tenantId) return;

    const bodyHash = hashBody(req.body);

    try {
      // Check for existing entry
      const existing = await db.query(
        `SELECT key, body_hash, status_code, response_body, expires_at
         FROM idempotency_keys
         WHERE tenant_id = $1 AND key = $2`,
        [tenantId, idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const entry = existing.rows[0];

        // Check expiration
        if (new Date(entry.expires_at) < new Date()) {
          // Delete expired entry
          await db.query(
            `DELETE FROM idempotency_keys WHERE tenant_id = $1 AND key = $2`,
            [tenantId, idempotencyKey]
          );
          return; // Proceed with new request
        }

        // Check body hash
        if (entry.body_hash !== bodyHash) {
          reply.code(409).send({
            error: 'Idempotency key already used with different payload',
            code: 'IDEMPOTENCY_KEY_CONFLICT'
          });
          return;
        }

        // Return cached response
        req.log.info({ idempotencyKey }, 'Returning cached idempotent response from DB');
        reply.header('X-Idempotent-Replayed', 'true');
        reply.code(entry.status_code).send(entry.response_body);
        return;
      }

      // Intercept response
      const originalSend = reply.send.bind(reply);
      
      reply.send = function(payload: any): FastifyReply {
        const statusCode = reply.statusCode;

        // Store response
        db.query(
          `INSERT INTO idempotency_keys (tenant_id, key, body_hash, method, path, status_code, response_body)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (tenant_id, key) DO NOTHING`,
          [tenantId, idempotencyKey, bodyHash, req.method, req.url, statusCode, payload]
        ).catch((err: Error) => {
          req.log.error({ err, idempotencyKey }, 'Failed to store idempotent response');
        });

        return originalSend(payload);
      };
    } catch (err) {
      req.log.error({ err, idempotencyKey }, 'Idempotency check failed');
      // Continue without idempotency on error
    }
  };
}

/**
 * Clean up expired idempotency keys (call periodically)
 */
export async function cleanupExpiredKeys(db: any): Promise<number> {
  const result = await db.query(
    `DELETE FROM idempotency_keys WHERE expires_at < NOW()`
  );
  return result.rowCount || 0;
}

/**
 * Generate idempotency key from request data
 * Useful for clients that don't provide explicit keys
 */
export function generateIdempotencyKey(prefix: string = 'auto'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
