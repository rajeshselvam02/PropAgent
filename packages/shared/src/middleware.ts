import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      tenant_id: string;
      role: 'agent' | 'manager';
      name: string;
    };
  }
}

// JWT verification middleware
export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
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
  } catch (err) {
    reply.code(401).send({ error: 'Invalid or expired token' });
    return;
  }
}

// Role-based access control
export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
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
export function tenantScope(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!req.user?.tenant_id) {
    reply.code(401).send({ error: 'Missing tenant context' });
    return;
  }
  done();
}

// JWT verification (simplified - use proper JWT library in production)
async function verifyJWT(token: string): Promise<any> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  
  // Check expiry
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new Error('Token expired');
  }
  
  return payload;
}

// Request ID middleware
export function requestIdMiddleware(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  const requestId = req.headers['x-request-id'] as string || 
    crypto.randomUUID?.() || 
    Math.random().toString(36).substring(2, 15);
  
  req.headers['x-request-id'] = requestId;
  reply.header('x-request-id', requestId);
  done();
}

// Audit logger
export async function auditLog(
  tenantId: string,
  actorUserId: string | undefined,
  action: string,
  entityType: string,
  entityId: string,
  metadata: any,
  ipAddress: string
) {
  // Import db dynamically to avoid circular deps
  const db = (await import('@propagent/db')).default;
  
  await db.query(`
    INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [tenantId, actorUserId, action, entityType, entityId, JSON.stringify(metadata), ipAddress]);
}

// Rate limiting store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
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
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 60000);
