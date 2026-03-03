import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import dotenv from 'dotenv';
import db from '@propagent/db';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

dotenv.config();

const fastify = Fastify({ logger: true });

// Register plugins
fastify.register(cors, { origin: true, credentials: true });
fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  sign: { expiresIn: '15m' }
});
fastify.register(cookie);

// Types
interface LoginBody {
  email: string;
  password: string;
  tenant_slug?: string;
}

interface RegisterBody {
  name: string;
  email: string;
  password: string;
  phone?: string;
  tenant_name: string;
}

// Helper: Hash token
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Helper: Generate random token
function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Helper: Encrypt PII
function encryptPII(plaintext: string): string {
  const key = Buffer.from(process.env.APP_PII_KEY || '0'.repeat(32), 'utf8');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = cipher.update(plaintext, 'utf8');
  const encrypted = Buffer.concat([enc, cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

// Helper: Decrypt PII
function decryptPII(encrypted: string): string {
  const key = Buffer.from(process.env.APP_PII_KEY || '0'.repeat(32), 'utf8');
  const [ivb64, encb64, tagb64] = encrypted.split('.');
  const iv = Buffer.from(ivb64, 'base64url');
  const enc = Buffer.from(encb64, 'base64url');
  const tag = Buffer.from(tagb64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = decipher.update(enc);
  return Buffer.concat([dec, decipher.final()]).toString('utf8');
}

// Helper: Hash for search
function hashForSearch(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// Bootstrap - Create first tenant and manager
fastify.post('/auth/bootstrap', async (req, reply) => {
  const body = req.body as RegisterBody;
  
  // Check if any tenant exists
  const existing = await db.query('SELECT COUNT(*) FROM tenants');
  if (parseInt(existing.rows[0].count) > 0) {
    reply.code(400).send({ error: 'System already bootstrapped' });
    return;
  }
  
  const tenantResult = await db.query(`
    INSERT INTO tenants (name, slug, plan)
    VALUES ($1, $2, 'trial')
    RETURNING *
  `, [body.tenant_name, body.tenant_name.toLowerCase().replace(/\s+/g, '-')]);
  
  const tenant = tenantResult.rows[0];
  const passwordHash = await bcrypt.hash(body.password, 12);
  
  const userResult = await db.query(`
    INSERT INTO users (tenant_id, name, email, email_hash, password_hash, phone, phone_hash, role)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'manager')
    RETURNING id, tenant_id, name, email, role
  `, [
    tenant.id,
    body.name,
    body.email,
    hashForSearch(body.email),
    passwordHash,
    body.phone ? encryptPII(body.phone) : null,
    body.phone ? hashForSearch(body.phone) : null
  ]);
  
  reply.send({ success: true, data: { tenant, user: userResult.rows[0] } });
});

// Login
fastify.post('/auth/login', async (req, reply) => {
  const body = req.body as LoginBody;
  
  // Find user
  const userResult = await db.query(`
    SELECT u.*, t.slug as tenant_slug, t.name as tenant_name
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.email_hash = $1 AND u.is_active = true
  `, [hashForSearch(body.email)]);
  
  if (userResult.rows.length === 0) {
    reply.code(401).send({ error: 'Invalid credentials' });
    return;
  }
  
  const user = userResult.rows[0];
  
  // Verify password
  const valid = await bcrypt.compare(body.password, user.password_hash);
  if (!valid) {
    reply.code(401).send({ error: 'Invalid credentials' });
    return;
  }
  
  // Generate tokens
  const accessToken = fastify.jwt.sign({
    sub: user.id,
    tid: user.tenant_id,
    role: user.role,
    name: user.name
  });
  
  const refreshToken = generateToken();
  const refreshTokenHash = hashToken(refreshToken);
  
  // Store refresh token
  await db.query(`
    INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES ($1, $2, $3, NOW() + INTERVAL '14 days', $4, $5)
  `, [user.tenant_id, user.id, refreshTokenHash, req.headers['user-agent'], req.ip]);
  
  // Update last login
  await db.query(`
    UPDATE users SET last_login_at = NOW(), login_count = login_count + 1
    WHERE id = $1
  `, [user.id]);
  
  // Log audit
  await db.query(`
    INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, ip_address)
    VALUES ($1, $2, 'login', 'user', $2, $3)
  `, [user.tenant_id, user.id, req.ip]);
  
  // Set cookie
  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60,
    path: '/'
  });
  
  reply.send({
    success: true,
    data: {
      access_token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        tenant_name: user.tenant_name
      }
    }
  });
});

// Refresh token
fastify.post('/auth/refresh', async (req, reply) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    reply.code(401).send({ error: 'No refresh token' });
    return;
  }
  
  const tokenHash = hashToken(refreshToken);
  
  const tokenResult = await db.query(`
    SELECT rt.*, u.name, u.role, u.tenant_id
    FROM refresh_tokens rt
    JOIN users u ON rt.user_id = u.id
    WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()
  `, [tokenHash]);
  
  if (tokenResult.rows.length === 0) {
    reply.code(401).send({ error: 'Invalid or expired refresh token' });
    return;
  }
  
  const token = tokenResult.rows[0];
  
  // Revoke old token
  await db.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [token.id]);
  
  // Generate new tokens
  const newAccessToken = fastify.jwt.sign({
    sub: token.user_id,
    tid: token.tenant_id,
    role: token.role,
    name: token.name
  });
  
  const newRefreshToken = generateToken();
  const newRefreshTokenHash = hashToken(newRefreshToken);
  
  // Store new refresh token
  await db.query(`
    INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at, rotated_from_id)
    VALUES ($1, $2, $3, NOW() + INTERVAL '14 days', $4)
  `, [token.tenant_id, token.user_id, newRefreshTokenHash, token.id]);
  
  reply.setCookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60,
    path: '/'
  });
  
  reply.send({ success: true, data: { access_token: newAccessToken } });
});

// Logout
fastify.post('/auth/logout', async (req, reply) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (refreshToken) {
    await db.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [hashToken(refreshToken)]);
  }
  
  reply.clearCookie('refreshToken');
  reply.send({ success: true });
});

// Get current user
fastify.get('/auth/me', async (req, reply) => {
  try {
    const decoded = await req.jwtVerify();
    
    const userResult = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.tenant_id, t.name as tenant_name
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = $1 AND u.is_active = true
    `, [decoded.sub]);
    
    if (userResult.rows.length === 0) {
      reply.code(401).send({ error: 'User not found' });
      return;
    }
    
    reply.send({ success: true, data: userResult.rows[0] });
  } catch {
    reply.code(401).send({ error: 'Invalid token' });
  }
});

// Health
fastify.get('/health', async () => ({ status: 'ok', service: 'auth' }));

const start = async () => {
  const port = Number(process.env.AUTH_PORT) || 4005;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Auth service on port ${port}`);
};

start().catch(console.error);
