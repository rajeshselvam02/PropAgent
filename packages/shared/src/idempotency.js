"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashBody = hashBody;
exports.idempotencyMiddleware = idempotencyMiddleware;
exports.createDbIdempotencyMiddleware = createDbIdempotencyMiddleware;
exports.cleanupExpiredKeys = cleanupExpiredKeys;
exports.generateIdempotencyKey = generateIdempotencyKey;
const crypto_1 = __importDefault(require("crypto"));
// In-memory cache for testing/development (use Redis in production)
const responseCache = new Map();
// Default TTL: 24 hours
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Generate SHA-256 hash of request body
 */
function hashBody(body) {
    if (!body)
        return 'empty';
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    return crypto_1.default.createHash('sha256').update(bodyString).digest('hex');
}
/**
 * Build cache key from tenant + idempotency key
 */
function buildCacheKey(tenantId, idempotencyKey) {
    return `${tenantId}:${idempotencyKey}`;
}
/**
 * Check if cache entry is expired
 */
function isExpired(entry) {
    return Date.now() - entry.createdAt.getTime() > DEFAULT_TTL_MS;
}
/**
 * Fastify middleware for idempotency checking
 *
 * Applies to POST requests with Idempotency-Key header
 */
async function idempotencyMiddleware(req, reply) {
    // Only apply to POST requests
    if (req.method !== 'POST')
        return;
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey)
        return;
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
    reply.send = function (payload) {
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
async function createDbIdempotencyMiddleware(db) {
    return async function dbIdempotencyMiddleware(req, reply) {
        if (req.method !== 'POST')
            return;
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey)
            return;
        if (!/^[a-zA-Z0-9_-]{1,255}$/.test(idempotencyKey)) {
            reply.code(400).send({ error: 'Invalid Idempotency-Key format' });
            return;
        }
        const tenantId = req.user?.tenant_id;
        if (!tenantId)
            return;
        const bodyHash = hashBody(req.body);
        try {
            // Check for existing entry
            const existing = await db.query(`SELECT key, body_hash, status_code, response_body, expires_at
         FROM idempotency_keys
         WHERE tenant_id = $1 AND key = $2`, [tenantId, idempotencyKey]);
            if (existing.rows.length > 0) {
                const entry = existing.rows[0];
                // Check expiration
                if (new Date(entry.expires_at) < new Date()) {
                    // Delete expired entry
                    await db.query(`DELETE FROM idempotency_keys WHERE tenant_id = $1 AND key = $2`, [tenantId, idempotencyKey]);
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
            reply.send = function (payload) {
                const statusCode = reply.statusCode;
                // Store response
                db.query(`INSERT INTO idempotency_keys (tenant_id, key, body_hash, method, path, status_code, response_body)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (tenant_id, key) DO NOTHING`, [tenantId, idempotencyKey, bodyHash, req.method, req.url, statusCode, payload]).catch((err) => {
                    req.log.error({ err, idempotencyKey }, 'Failed to store idempotent response');
                });
                return originalSend(payload);
            };
        }
        catch (err) {
            req.log.error({ err, idempotencyKey }, 'Idempotency check failed');
            // Continue without idempotency on error
        }
    };
}
/**
 * Clean up expired idempotency keys (call periodically)
 */
async function cleanupExpiredKeys(db) {
    const result = await db.query(`DELETE FROM idempotency_keys WHERE expires_at < NOW()`);
    return result.rowCount || 0;
}
/**
 * Generate idempotency key from request data
 * Useful for clients that don't provide explicit keys
 */
function generateIdempotencyKey(prefix = 'auto') {
    return `${prefix}-${crypto_1.default.randomUUID()}`;
}
//# sourceMappingURL=idempotency.js.map