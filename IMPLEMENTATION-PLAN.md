# PropAgent Implementation Plan

## Current Status (Mar 4, 2026)

### ✅ Completed
- Core database schema (leads, agents, projects, visits, commute, analytics)
- Auth service (JWT, refresh tokens, PII encryption, audit log)
- Ingestion service (lead intake, webhooks, lifecycle endpoints)
- Shared middleware (auth, RBAC, rate limiting, tenant isolation)
- WhatsApp qualification flow (basic)
- Commute service (cab management)
- Gateway service
- Single-file dashboards (placeholder)

### ❌ Missing (Per Roadmap)

## Phase 1: Async Foundation (Week 1-2)
**Goal:** Resilient job processing, no lost events

### 1.1 Create Worker Service
- `services/worker/` - BullMQ worker process
- Queues: followups, notifications, whatsapp, email, maintenance, analytics, webhooks
- Retry policy: 8 attempts, exponential backoff (5s base, 10m cap)
- DLQ visibility table

### 1.2 Outbox Pattern
- `outbox_events` table
- Publisher worker to emit events after DB commit
- Event taxonomy: lead.created, lead.updated, lead.assigned, etc.

### 1.3 Job Types
- `followup.schedule` - delayed job for reminders
- `followup.remind` - sends reminder notification
- `whatsapp.send_message` - send WhatsApp via API
- `email.send` - send email
- `analytics.compute_rollup` - daily snapshots

## Phase 2: Idempotency + Concurrency (Week 2)
**Goal:** No duplicate leads, no lost updates

### 2.1 Idempotency Layer
- `idempotency_keys` table
- Middleware to check/store responses
- Apply to all POST endpoints

### 2.2 Optimistic Concurrency
- Add `version` column to leads
- 409 Conflict on stale writes
- Update all PUT endpoints

### 2.3 Deduplication
- Unique constraint on (tenant_id, phone_hash)
- Upsert logic for duplicate leads

## Phase 3: BI Layer (Week 3-4)
**Goal:** Actionable analytics for managers

### 3.1 Data Structures
- `lead_activities` table (calls, messages, notes)
- `deals` table (revenue tracking)
- Analytics rollup tables

### 3.2 Endpoints
- `GET /api/analytics/funnel` - conversion funnel
- `GET /api/analytics/time-to-conversion`
- `GET /api/analytics/agent-performance`
- `GET /api/analytics/source-roi`

### 3.3 Scheduled Jobs
- Daily analytics snapshot
- Agent efficiency scoring

## Phase 4: SaaS Layer (Week 5-6)
**Goal:** Billable product

### 4.1 Billing Schema
- `plans` table
- `tenant_subscriptions` table
- `usage_counters` table
- `feature_flags` table

### 4.2 Stripe Integration
- Webhook handler for subscription events
- Plan enforcement middleware

### 4.3 Tenant Admin UI
- Billing page
- Usage dashboard
- Feature toggles

## Phase 5: Production UI (Week 7-8)
**Goal:** Market-ready frontend

### 5.1 React App Setup
- Next.js App Router
- Design tokens + component library
- TanStack Query for state

### 5.2 Core Screens
- Login + tenant select
- Lead pipeline (Kanban)
- Lead details workspace
- Follow-up manager
- Analytics dashboard

### 5.3 Mobile Responsiveness
- Responsive layouts
- Touch-friendly interactions

---

## Immediate Next Steps

1. **Create worker service** (`services/worker`)
2. **Add BullMQ + Redis** infrastructure
3. **Create outbox_events table** + publisher
4. **Move follow-up reminders to jobs**
5. **Add idempotency middleware**

---

*Last updated: 2026-03-04*
