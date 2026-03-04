# Phase 4: SaaS Billing Layer Implementation

## Files Created/Modified

### 1. Billing Schema (`packages/db/src/billing-migration.ts`)
- **Plans table**: id, name, stripe_price_id, limits (JSONB), features (JSONB), price_monthly
- **tenant_subscriptions table**: tenant_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_end
- **usage_counters table**: tenant_id, period_start, period_end, leads_count, whatsapp_count, storage_mb
- **feature_flags table**: tenant_id, flags (JSONB)
- **invoices table**: Stripe invoice history
- **usage_events table**: Metered billing events

**Plan Seeding:**
- **Starter**: ₹15k/mo, 500 leads, 1000 WhatsApp, basic analytics
- **Growth**: ₹35k/mo, 2000 leads, 5000 WhatsApp, advanced analytics  
- **Enterprise**: ₹75k/mo, unlimited leads/WhatsApp, custom integrations, priority support

**Run migration:**
```bash
cd packages/db
npm run migrate:billing
```

---

### 2. Stripe Webhook Handler (`services/auth/src/stripe-webhook.ts`)
Handles Stripe events:
- `customer.subscription.created` - Creates subscription record
- `customer.subscription.updated` - Updates plan/status
- `customer.subscription.deleted` - Marks as cancelled
- `invoice.payment_failed` - Logs alert, marks past_due
- `checkout.session.completed` - Links checkout to tenant

**Signature verification** with timing-safe comparison.
**Port**: 4010 (configurable via STRIPE_WEBHOOK_PORT)

---

### 3. Plan Enforcement (`packages/shared/src/billing.ts`)
**Functions:**
- `getTenantSubscription()` - Get current plan & limits
- `getTenantUsage()` - Get usage counters for billing period
- `canPerformAction()` - Check if action allowed (lead/whatsapp/storage)
- `hasFeatureAccess()` - Check feature availability
- `incrementUsage()` - Increment usage counters
- `getAvailablePlans()` - List all plans

**Middleware:**
- `checkLeadLimit` - Returns 402 if lead limit exceeded
- `checkWhatsAppLimit` - Returns 402 if WhatsApp limit exceeded
- `requireFeature()` - Returns 402 if feature not available

**Error Response Format:**
```json
{
  "error": "Lead limit exceeded",
  "code": "LIMIT_EXCEEDED",
  "message": "You have reached your monthly lead limit of 500. Upgrade your plan to add more leads.",
  "current_usage": 500,
  "limit": 500,
  "plan": "Starter",
  "upgrade_url": "/billing/upgrade"
}
```

---

### 4. Tenant Admin Endpoints (`services/auth/src/index.ts`)

**GET /auth/tenant/plan**
- Returns current plan, limits, usage, remaining allowances
- Auth required (JWT)

**POST /auth/tenant/checkout**
- Creates Stripe checkout session for plan upgrade
- Body: `{ plan_id, success_url?, cancel_url? }`
- Manager role required

**POST /auth/tenant/check-limit**
- Check if action allowed
- Body: `{ action: 'lead'|'whatsapp'|'storage', quantity? }`
- Returns 402 if limit exceeded

**POST /auth/tenant/check-feature**
- Check feature access
- Body: `{ feature: string }`
- Returns 402 if not available

**GET /plans**
- Public endpoint listing available plans

**POST /webhook/stripe**
- Webhook passthrough (proxied to stripe-webhook service)

---

## Exit Criteria Verification

✅ **Tenants have plan limits**
- Plans seeded with limits (leads, WhatsApp, storage, agents, projects)
- Usage tracked per billing period
- Limits checked via `canPerformAction()`

✅ **Stripe webhooks update subscription status**
- Handler for all key events
- Signature verification
- Status mapping (active/past_due/cancelled/trialing)

✅ **Over-limit requests return 402**
- `checkLeadLimit` middleware
- `checkWhatsAppLimit` middleware  
- Proper error response with upgrade URL
- HTTP 402 Payment Required status code

---

## Usage Examples

### Check lead limit before creating lead:
```typescript
import { checkLeadLimit } from '@propagent/shared';

// In route handler
app.post('/leads', { preHandler: [authMiddleware, checkLeadLimit] }, async (req, reply) => {
  // Lead creation logic
});
```

### Check WhatsApp limit before sending:
```typescript
import { canPerformAction, incrementUsage } from '@propagent/shared';

const check = await canPerformAction(tenantId, 'whatsapp', 10);
if (!check.allowed) {
  throw new BillingError('LIMIT_EXCEEDED', 'WhatsApp limit exceeded');
}
// Send messages...
await incrementUsage(tenantId, 'whatsapp', 10);
```

### Check feature access:
```typescript
import { hasFeatureAccess } from '@propagent/shared';

const hasApi = await hasFeatureAccess(tenantId, 'api_access');
if (!hasApi) {
  return reply.code(402).send({ error: 'API access requires Growth plan or higher' });
}
```

---

## Environment Variables

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_WEBHOOK_PORT=4010

# Billing
STRIPE_WEBHOOK_URL=http://localhost:4010/webhook/stripe
STRIPE_CHECKOUT_URL=https://checkout.stripe.com

# App
APP_URL=https://app.propagent.io
JWT_SECRET=your-secret
```

---

## Database Schema Summary

```sql
-- Plans
plans (id, name, stripe_price_id, limits, features, price_monthly)

-- Subscriptions
tenant_subscriptions (tenant_id, plan_id, status, current_period_end, ...)

-- Usage Tracking
usage_counters (tenant_id, period_start, leads_count, whatsapp_count, storage_mb)

-- Feature Overrides
feature_flags (tenant_id, flags)

-- Invoice History
invoices (tenant_id, stripe_invoice_id, amount, status, ...)

-- Usage Events
usage_events (tenant_id, event_type, quantity, metadata)
```
