"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("@propagent/db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const shared_1 = require("@propagent/shared");
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({ logger: true });
// Register plugins
fastify.register(cors_1.default, { origin: true, credentials: true });
fastify.register(jwt_1.default, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    sign: { expiresIn: '15m' }
});
fastify.register(cookie_1.default);
// Helper: Hash token
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
// Helper: Generate random token
function generateToken() {
    return crypto_1.default.randomBytes(32).toString('base64url');
}
// Helper: Encrypt PII
function encryptPII(plaintext) {
    const key = Buffer.from(process.env.APP_PII_KEY || '0'.repeat(32), 'utf8');
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const enc = cipher.update(plaintext, 'utf8');
    const encrypted = Buffer.concat([enc, cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}
// Helper: Decrypt PII
function decryptPII(encrypted) {
    const key = Buffer.from(process.env.APP_PII_KEY || '0'.repeat(32), 'utf8');
    const [ivb64, encb64, tagb64] = encrypted.split('.');
    const iv = Buffer.from(ivb64, 'base64url');
    const enc = Buffer.from(encb64, 'base64url');
    const tag = Buffer.from(tagb64, 'base64url');
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = decipher.update(enc);
    return Buffer.concat([dec, decipher.final()]).toString('utf8');
}
// Helper: Hash for search
function hashForSearch(value) {
    return crypto_1.default.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}
// JWT verification middleware
async function authMiddleware(req, reply) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        reply.code(401).send({ error: 'Missing or invalid authorization header' });
        return;
    }
    const token = authHeader.substring(7);
    try {
        const decoded = await req.jwtVerify();
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
// Bootstrap - Create first tenant and manager
fastify.post('/auth/bootstrap', async (req, reply) => {
    const body = req.body;
    // Check if any tenant exists
    const existing = await db_1.default.query('SELECT COUNT(*) FROM tenants');
    if (parseInt(existing.rows[0].count) > 0) {
        reply.code(400).send({ error: 'System already bootstrapped' });
        return;
    }
    const tenantResult = await db_1.default.query(`
    INSERT INTO tenants (name, slug, plan)
    VALUES ($1, $2, 'trial')
    RETURNING *
  `, [body.tenant_name, body.tenant_name.toLowerCase().replace(/\s+/g, '-')]);
    const tenant = tenantResult.rows[0];
    const passwordHash = await bcrypt_1.default.hash(body.password, 12);
    const userResult = await db_1.default.query(`
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
    // Create default subscription with Starter plan
    const starterPlan = await db_1.default.query("SELECT id FROM plans WHERE name = 'Starter' LIMIT 1");
    if (starterPlan.rows.length > 0) {
        await db_1.default.query(`
      INSERT INTO tenant_subscriptions (tenant_id, plan_id, status)
      VALUES ($1, $2, 'trialing')
    `, [tenant.id, starterPlan.rows[0].id]);
    }
    reply.send({
        success: true,
        data: {
            tenant,
            user: userResult.rows[0]
        }
    });
});
// Login
fastify.post('/auth/login', async (req, reply) => {
    const body = req.body;
    // Find user
    const userResult = await db_1.default.query(`
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
    const valid = await bcrypt_1.default.compare(body.password, user.password_hash);
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
    await db_1.default.query(`
    INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES ($1, $2, $3, NOW() + INTERVAL '14 days', $4, $5)
  `, [user.tenant_id, user.id, refreshTokenHash, req.headers['user-agent'], req.ip]);
    // Update last login
    await db_1.default.query(`
    UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1
  `, [user.id]);
    // Log audit
    await db_1.default.query(`
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
    const tokenResult = await db_1.default.query(`
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
    await db_1.default.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [token.id]);
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
    await db_1.default.query(`
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
        await db_1.default.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [hashToken(refreshToken)]);
    }
    reply.clearCookie('refreshToken');
    reply.send({ success: true });
});
// Get current user
fastify.get('/auth/me', async (req, reply) => {
    try {
        const decoded = await req.jwtVerify();
        const userResult = await db_1.default.query(`
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
    }
    catch {
        reply.code(401).send({ error: 'Invalid token' });
    }
});
// ============================================
// BILLING ENDPOINTS
// ============================================
// Get current tenant plan and usage
fastify.get('/auth/tenant/plan', { preHandler: authMiddleware }, async (req, reply) => {
    try {
        const tenantId = req.user.tenant_id;
        const [subscription, usage, plans] = await Promise.all([
            (0, shared_1.getTenantSubscription)(tenantId),
            (0, shared_1.getTenantUsage)(tenantId),
            (0, shared_1.getAvailablePlans)()
        ]);
        if (!subscription) {
            reply.code(404).send({ error: 'Subscription not found' });
            return;
        }
        // Calculate remaining limits
        const leadsRemaining = subscription.limits.leads === -1
            ? Infinity
            : Math.max(0, subscription.limits.leads - usage.leads_count);
        const whatsappRemaining = subscription.limits.whatsapp === -1
            ? Infinity
            : Math.max(0, subscription.limits.whatsapp - usage.whatsapp_count);
        const storageRemaining = subscription.limits.storage_mb === -1
            ? Infinity
            : Math.max(0, subscription.limits.storage_mb - usage.storage_mb);
        reply.send({
            success: true,
            data: {
                subscription: {
                    id: subscription.id,
                    plan_name: subscription.plan_name,
                    plan_id: subscription.plan_id,
                    status: subscription.status,
                    current_period_end: subscription.current_period_end,
                    stripe_customer_id: subscription.stripe_customer_id,
                    stripe_subscription_id: subscription.stripe_subscription_id
                },
                plan: {
                    limits: subscription.limits,
                    features: subscription.features
                },
                usage: {
                    leads: {
                        used: usage.leads_count,
                        limit: subscription.limits.leads === -1 ? 'unlimited' : subscription.limits.leads,
                        remaining: leadsRemaining === Infinity ? 'unlimited' : leadsRemaining
                    },
                    whatsapp: {
                        used: usage.whatsapp_count,
                        limit: subscription.limits.whatsapp === -1 ? 'unlimited' : subscription.limits.whatsapp,
                        remaining: whatsappRemaining === Infinity ? 'unlimited' : whatsappRemaining
                    },
                    storage: {
                        used: parseFloat(usage.storage_mb.toFixed(2)),
                        limit: subscription.limits.storage_mb === -1 ? 'unlimited' : subscription.limits.storage_mb,
                        remaining: storageRemaining === Infinity ? 'unlimited' : parseFloat(storageRemaining.toFixed(2))
                    },
                    period_start: usage.period_start,
                    period_end: usage.period_end
                },
                available_plans: plans
            }
        });
    }
    catch (error) {
        console.error('Error fetching plan:', error);
        reply.code(500).send({ error: 'Failed to fetch plan information' });
    }
});
// Create Stripe checkout session for plan upgrade
fastify.post('/auth/tenant/checkout', { preHandler: authMiddleware }, async (req, reply) => {
    try {
        const { plan_id, success_url, cancel_url } = req.body;
        if (!plan_id) {
            reply.code(400).send({ error: 'Plan ID is required' });
            return;
        }
        const tenantId = req.user.tenant_id;
        // Check if user is manager
        if (req.user.role !== 'manager') {
            reply.code(403).send({ error: 'Only managers can upgrade plans' });
            return;
        }
        const session = await (0, shared_1.createCheckoutSession)(tenantId, plan_id, success_url || `${process.env.APP_URL}/billing/success`, cancel_url || `${process.env.APP_URL}/billing/cancel`);
        reply.send({
            success: true,
            data: {
                checkout_url: session.url,
                session_id: session.sessionId
            }
        });
    }
    catch (error) {
        if (error instanceof shared_1.BillingError) {
            reply.code(error.statusCode).send({ error: error.message, code: error.code });
            return;
        }
        console.error('Error creating checkout:', error);
        reply.code(500).send({ error: 'Failed to create checkout session' });
    }
});
// Get all available plans (public)
fastify.get('/plans', async (req, reply) => {
    try {
        const plans = await (0, shared_1.getAvailablePlans)();
        reply.send({ success: true, data: plans });
    }
    catch (error) {
        console.error('Error fetching plans:', error);
        reply.code(500).send({ error: 'Failed to fetch plans' });
    }
});
// Check if action is allowed (for internal service calls)
fastify.post('/auth/tenant/check-limit', { preHandler: authMiddleware }, async (req, reply) => {
    try {
        const { action, quantity } = req.body;
        if (!action || !['lead', 'whatsapp', 'storage'].includes(action)) {
            reply.code(400).send({ error: 'Invalid action. Must be lead, whatsapp, or storage' });
            return;
        }
        const tenantId = req.user.tenant_id;
        const result = await (0, shared_1.canPerformAction)(tenantId, action, quantity || 1);
        if (!result.allowed) {
            reply.code(402).send({
                error: `${action === 'lead' ? 'Lead' : action === 'whatsapp' ? 'WhatsApp' : 'Storage'} limit exceeded`,
                code: 'LIMIT_EXCEEDED',
                remaining: result.remaining,
                limit: result.limit
            });
            return;
        }
        reply.send({
            success: true,
            data: {
                allowed: true,
                remaining: result.remaining === Infinity ? 'unlimited' : result.remaining,
                limit: result.limit === -1 ? 'unlimited' : result.limit
            }
        });
    }
    catch (error) {
        console.error('Error checking limit:', error);
        reply.code(500).send({ error: 'Failed to check limit' });
    }
});
// Check feature access
fastify.post('/auth/tenant/check-feature', { preHandler: authMiddleware }, async (req, reply) => {
    try {
        const { feature } = req.body;
        if (!feature) {
            reply.code(400).send({ error: 'Feature is required' });
            return;
        }
        const tenantId = req.user.tenant_id;
        const hasAccess = await (0, shared_1.hasFeatureAccess)(tenantId, feature);
        if (!hasAccess) {
            reply.code(402).send({
                error: 'Feature not available',
                code: 'FEATURE_NOT_AVAILABLE',
                feature
            });
            return;
        }
        reply.send({ success: true, data: { has_access: true } });
    }
    catch (error) {
        console.error('Error checking feature:', error);
        reply.code(500).send({ error: 'Failed to check feature access' });
    }
});
// Health
fastify.get('/health', async () => ({ status: 'ok', service: 'auth' }));
// Stripe webhook endpoint (proxied from stripe-webhook service)
fastify.post('/webhook/stripe', async (req, reply) => {
    // This is a passthrough to the stripe-webhook service
    // In production, Stripe webhooks should go directly to the stripe-webhook service
    // This endpoint exists as a fallback
    const signature = req.headers['stripe-signature'];
    if (!signature) {
        reply.code(400).send({ error: 'Missing Stripe signature' });
        return;
    }
    // Forward to stripe-webhook service
    const webhookUrl = process.env.STRIPE_WEBHOOK_URL || 'http://localhost:4010/webhook/stripe';
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Stripe-Signature': signature
            },
            body: JSON.stringify(req.body)
        });
        if (!response.ok) {
            throw new Error(`Webhook service returned ${response.status}`);
        }
        reply.send({ received: true });
    }
    catch (error) {
        console.error('Error forwarding webhook:', error);
        reply.code(500).send({ error: 'Webhook processing failed' });
    }
});
const start = async () => {
    const port = Number(process.env.AUTH_PORT) || 4005;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Auth service on port ${port}`);
};
start().catch(console.error);
//# sourceMappingURL=index.js.map