"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSubscriptionCreated = handleSubscriptionCreated;
exports.handleSubscriptionUpdated = handleSubscriptionUpdated;
exports.handleSubscriptionDeleted = handleSubscriptionDeleted;
exports.handlePaymentFailed = handlePaymentFailed;
exports.handleCheckoutCompleted = handleCheckoutCompleted;
exports.verifyStripeSignature = verifyStripeSignature;
const fastify_1 = __importDefault(require("fastify"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = __importDefault(require("@propagent/db"));
// Stripe webhook handler service
const fastify = (0, fastify_1.default)({ logger: true });
// Stripe signature verification
function verifyStripeSignature(payload, signature, secret) {
    const elements = signature.split(',');
    const timestamp = elements.find(e => e.startsWith('t='))?.substring(2);
    const v1Signature = elements.find(e => e.startsWith('v1='))?.substring(3);
    if (!timestamp || !v1Signature)
        return false;
    // Check timestamp is within 5 minutes
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (timestampAge > 300)
        return false;
    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto_1.default
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(v1Signature), Buffer.from(expectedSignature));
}
// Get plan by Stripe price ID
async function getPlanByPriceId(priceId) {
    const result = await db_1.default.query('SELECT * FROM plans WHERE stripe_price_id = $1 AND is_active = true', [priceId]);
    return result.rows[0];
}
// Get default plan (Starter)
async function getDefaultPlan() {
    const result = await db_1.default.query("SELECT * FROM plans WHERE name = 'Starter' AND is_active = true");
    return result.rows[0];
}
// Handle subscription created
async function handleSubscriptionCreated(subscription) {
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const status = subscription.status;
    const currentPeriodStart = new Date(subscription.current_period_start * 1000);
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    // Find tenant by Stripe customer ID or create customer mapping
    let tenantResult = await db_1.default.query('SELECT tenant_id FROM tenant_subscriptions WHERE stripe_customer_id = $1', [customerId]);
    let tenantId = tenantResult.rows[0]?.tenant_id;
    // If not found, try to find tenant by metadata
    if (!tenantId && subscription.metadata?.tenant_id) {
        tenantId = subscription.metadata.tenant_id;
    }
    if (!tenantId) {
        console.error('No tenant found for subscription:', subscriptionId);
        return;
    }
    // Get plan
    const plan = priceId ? await getPlanByPriceId(priceId) : await getDefaultPlan();
    if (!plan) {
        console.error('No plan found for price:', priceId);
        return;
    }
    // Upsert subscription
    await db_1.default.query(`
    INSERT INTO tenant_subscriptions (
      tenant_id, stripe_customer_id, stripe_subscription_id, plan_id,
      status, current_period_start, current_period_end
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      status = EXCLUDED.status,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = false,
      cancelled_at = NULL,
      updated_at = NOW()
  `, [tenantId, customerId, subscriptionId, plan.id, status, currentPeriodStart, currentPeriodEnd]);
    // Initialize usage counter for the period
    await db_1.default.query(`
    INSERT INTO usage_counters (tenant_id, period_start, period_end)
    VALUES ($1, $2, $3)
    ON CONFLICT (tenant_id, period_start) DO NOTHING
  `, [tenantId, currentPeriodStart, currentPeriodEnd]);
    // Update tenant plan
    await db_1.default.query('UPDATE tenants SET plan = $1, updated_at = NOW() WHERE id = $2', [plan.name.toLowerCase(), tenantId]);
    // Log audit
    await db_1.default.query(`
    INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, metadata)
    VALUES ($1, 'subscription.created', 'subscription', $2, $3)
  `, [tenantId, subscriptionId, JSON.stringify({ plan: plan.name, status })]);
    console.log(`✅ Subscription created: ${subscriptionId} for tenant ${tenantId}`);
}
// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
    const subscriptionId = subscription.id;
    const status = subscription.status;
    const currentPeriodStart = new Date(subscription.current_period_start * 1000);
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    // Get existing subscription
    const subResult = await db_1.default.query('SELECT * FROM tenant_subscriptions WHERE stripe_subscription_id = $1', [subscriptionId]);
    if (subResult.rows.length === 0) {
        console.error('Subscription not found:', subscriptionId);
        return;
    }
    const existing = subResult.rows[0];
    // Get plan if price changed
    let planId = existing.plan_id;
    if (priceId) {
        const plan = await getPlanByPriceId(priceId);
        if (plan)
            planId = plan.id;
    }
    // Update subscription
    await db_1.default.query(`
    UPDATE tenant_subscriptions SET
      plan_id = $1,
      status = $2,
      current_period_start = $3,
      current_period_end = $4,
      cancel_at_period_end = $5,
      cancelled_at = CASE WHEN $6 THEN NOW() ELSE cancelled_at END,
      updated_at = NOW()
    WHERE stripe_subscription_id = $7
  `, [planId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, cancelAtPeriodEnd, subscriptionId]);
    // If new period, create usage counter
    await db_1.default.query(`
    INSERT INTO usage_counters (tenant_id, period_start, period_end)
    SELECT tenant_id, $1, $2 FROM tenant_subscriptions WHERE stripe_subscription_id = $3
    ON CONFLICT (tenant_id, period_start) DO NOTHING
  `, [currentPeriodStart, currentPeriodEnd, subscriptionId]);
    // Get plan name for audit
    const planResult = await db_1.default.query('SELECT name FROM plans WHERE id = $1', [planId]);
    const planName = planResult.rows[0]?.name?.toLowerCase() || 'unknown';
    // Update tenant plan
    await db_1.default.query('UPDATE tenants SET plan = $1, updated_at = NOW() WHERE id = $2', [planName, existing.tenant_id]);
    // Log audit
    await db_1.default.query(`
    INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, metadata)
    VALUES ($1, 'subscription.updated', 'subscription', $2, $3)
  `, [existing.tenant_id, subscriptionId, JSON.stringify({ status, cancel_at_period_end: cancelAtPeriodEnd })]);
    console.log(`✅ Subscription updated: ${subscriptionId}`);
}
// Handle subscription deleted
async function handleSubscriptionDeleted(subscription) {
    const subscriptionId = subscription.id;
    // Get existing subscription
    const subResult = await db_1.default.query('SELECT * FROM tenant_subscriptions WHERE stripe_subscription_id = $1', [subscriptionId]);
    if (subResult.rows.length === 0) {
        console.error('Subscription not found:', subscriptionId);
        return;
    }
    const existing = subResult.rows[0];
    // Mark subscription as cancelled
    await db_1.default.query(`
    UPDATE tenant_subscriptions SET
      status = 'cancelled',
      cancelled_at = NOW(),
      cancel_at_period_end = true,
      updated_at = NOW()
    WHERE stripe_subscription_id = $1
  `, [subscriptionId]);
    // Downgrade to trial or inactive
    await db_1.default.query("UPDATE tenants SET plan = 'trial', updated_at = NOW() WHERE id = $1", [existing.tenant_id]);
    // Log audit
    await db_1.default.query(`
    INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, metadata)
    VALUES ($1, 'subscription.cancelled', 'subscription', $2, $3)
  `, [existing.tenant_id, subscriptionId, JSON.stringify({ cancelled_at: new Date().toISOString() })]);
    console.log(`✅ Subscription cancelled: ${subscriptionId}`);
}
// Handle payment failed
async function handlePaymentFailed(invoice) {
    const customerId = invoice.customer;
    const subscriptionId = invoice.subscription;
    const attemptCount = invoice.attempt_count || 1;
    // Get tenant subscription
    const subResult = await db_1.default.query('SELECT * FROM tenant_subscriptions WHERE stripe_customer_id = $1', [customerId]);
    if (subResult.rows.length === 0) {
        console.error('No subscription found for customer:', customerId);
        return;
    }
    const sub = subResult.rows[0];
    // Log payment failure
    await db_1.default.query(`
    INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, metadata)
    VALUES ($1, 'payment.failed', 'invoice', $2, $3)
  `, [sub.tenant_id, invoice.id, JSON.stringify({
            attempt_count: attemptCount,
            amount: invoice.amount_due,
            currency: invoice.currency
        })]);
    // If multiple attempts, mark subscription as past_due
    if (attemptCount >= 2) {
        await db_1.default.query(`
      UPDATE tenant_subscriptions SET status = 'past_due', updated_at = NOW()
      WHERE stripe_subscription_id = $1
    `, [subscriptionId]);
    }
    // TODO: Send notification to tenant admin
    console.log(`⚠️ Payment failed for tenant ${sub.tenant_id}, attempt ${attemptCount}`);
}
// Handle checkout session completed
async function handleCheckoutCompleted(session) {
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const tenantId = session.metadata?.tenant_id;
    if (!tenantId) {
        console.error('No tenant_id in checkout session metadata');
        return;
    }
    // Update or create subscription record
    await db_1.default.query(`
    UPDATE tenant_subscriptions SET
      stripe_customer_id = $1,
      stripe_subscription_id = $2
    WHERE tenant_id = $3
  `, [customerId, subscriptionId, tenantId]);
    // If no subscription record exists, create one (will be filled by subscription.created webhook)
    await db_1.default.query(`
    INSERT INTO tenant_subscriptions (tenant_id, stripe_customer_id, stripe_subscription_id, plan_id, status)
    SELECT $1, $2, $3, p.id, 'active'
    FROM plans p WHERE p.name = 'Starter'
    ON CONFLICT (tenant_id) DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id
  `, [tenantId, customerId, subscriptionId]);
    console.log(`✅ Checkout completed for tenant ${tenantId}`);
}
// Webhook endpoint
fastify.post('/webhook/stripe', async (req, reply) => {
    const signature = req.headers['stripe-signature'];
    const payload = JSON.stringify(req.body);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!signature || !webhookSecret) {
        reply.code(400).send({ error: 'Missing signature or secret' });
        return;
    }
    // Verify signature
    if (!verifyStripeSignature(payload, signature, webhookSecret)) {
        reply.code(400).send({ error: 'Invalid signature' });
        return;
    }
    const event = req.body;
    const eventType = event.type;
    const data = event.data?.object;
    console.log(`📬 Received Stripe webhook: ${eventType}`);
    try {
        switch (eventType) {
            case 'customer.subscription.created':
                await handleSubscriptionCreated(data);
                break;
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(data);
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(data);
                break;
            case 'invoice.payment_failed':
                await handlePaymentFailed(data);
                break;
            case 'checkout.session.completed':
                await handleCheckoutCompleted(data);
                break;
            default:
                console.log(`Unhandled event type: ${eventType}`);
        }
        reply.send({ received: true });
    }
    catch (error) {
        console.error('Error processing webhook:', error);
        reply.code(500).send({ error: 'Webhook processing failed' });
    }
});
// Health check
fastify.get('/health', async () => ({ status: 'ok', service: 'stripe-webhook' }));
const start = async () => {
    const port = Number(process.env.STRIPE_WEBHOOK_PORT) || 4010;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Stripe webhook handler on port ${port}`);
};
start().catch(console.error);
//# sourceMappingURL=stripe-webhook.js.map