"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.requireRole = requireRole;
exports.tenantScope = tenantScope;
exports.requestIdMiddleware = requestIdMiddleware;
exports.auditLog = auditLog;
exports.rateLimit = rateLimit;
// JWT verification middleware
async function authMiddleware(req, reply) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        reply.code(401).send({ error: 'Missing or invalid authorization header' });
        return;
    }
    const token = authHeader.substring(7);
    try {
        // Verify JWT (in production, use shared secret or JWKS)
        const decoded = await verifyJWT(token);
        req.user = {
            id: decoded.sub,
            tenant_id: decoded.tid,
            role: decoded.role,
            name: decoded.name
        };
    }
    catch (err) {
        reply.code(401).send({ error: 'Invalid or expired token' });
        return;
    }
}
// Role-based access control
function requireRole(...roles) {
    return async (req, reply) => {
        if (!req.user) {
            reply.code(401).send({ error: 'Not authenticated' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            reply.code(403).send({ error: 'Insufficient permissions' });
            return;
        }
    };
}
// Tenant isolation middleware
function tenantScope(req, reply, done) {
    if (!req.user?.tenant_id) {
        reply.code(401).send({ error: 'Missing tenant context' });
        return;
    }
    done();
}
// JWT verification (simplified - use proper JWT library in production)
async function verifyJWT(token) {
    const parts = token.split('.');
    if (parts.length !== 3)
        throw new Error('Invalid JWT format');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
        throw new Error('Token expired');
    }
    return payload;
}
// Request ID middleware
function requestIdMiddleware(req, reply, done) {
    const requestId = req.headers['x-request-id'] ||
        crypto.randomUUID?.() ||
        Math.random().toString(36).substring(2, 15);
    req.headers['x-request-id'] = requestId;
    reply.header('x-request-id', requestId);
    done();
}
// Audit logger
async function auditLog(tenantId, actorUserId, action, entityType, entityId, metadata, ipAddress) {
    // Import db dynamically to avoid circular deps
    const db = (await Promise.resolve().then(() => __importStar(require('@propagent/db')))).default;
    await db.query(`
    INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [tenantId, actorUserId, action, entityType, entityId, JSON.stringify(metadata), ipAddress]);
}
// Rate limiting store
const rateLimitStore = new Map();
function rateLimit(maxRequests, windowMs) {
    return (req, reply, done) => {
        const key = `${req.ip}:${req.url}`;
        const now = Date.now();
        const entry = rateLimitStore.get(key);
        if (!entry || now > entry.resetAt) {
            rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
            done();
            return;
        }
        if (entry.count >= maxRequests) {
            reply.code(429).header('Retry-After', Math.ceil((entry.resetAt - now) / 1000).toString());
            reply.send({ error: 'Too many requests' });
            return;
        }
        entry.count++;
        done();
    };
}
// Clean up rate limit store periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetAt)
            rateLimitStore.delete(key);
    }
}, 60000);
//# sourceMappingURL=middleware.js.map