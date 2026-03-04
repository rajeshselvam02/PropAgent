# PropAgent Phase 1 Complete

## What Was Built

### Worker Service (`services/worker/`)
- **Config** - Job types, queue names, retry policy, domain events
- **Queues** - BullMQ setup for: followups, notifications, whatsapp, email, maintenance, analytics, webhooks, outbox
- **Processors**:
  - `followups.ts` - Schedule and send follow-up reminders
  - `whatsapp.ts` - Send messages, qualification flow
  - `email.ts` - Email sending with templates
  - `analytics.ts` - Daily rollups, agent performance scoring, funnel metrics
  - `outbox.ts` - Reliable event emission pattern
  - `dlq.ts` - Dead Letter Queue handling
- **Worker entry** - Main worker with scheduler for periodic jobs

### Database Migration (`packages/db/src/worker-migration.ts`)
Tables added:
- `outbox_events` - For reliable event emission
- `domain_events` - Materialized events for querying
- `dead_letters` - DLQ visibility
- `email_logs` - Email tracking
- `pending_notifications` - Agent notifications
- `agent_performance` - Performance scoring
- `lead_activities` - Activity tracking

### Ingestion Service Integration
- Replaced direct calls with job queues
- Added outbox event emission on all mutations
- Events: lead.created, lead.status_changed, lead.assigned, etc.

## Retry Policy
- **Attempts**: 8
- **Backoff**: Exponential (5s base, 10m cap)
- **DLQ**: Failed jobs logged for manager review

## Event Taxonomy
```
lead.created, lead.updated, lead.assigned, lead.status_changed, lead.score_calculated
followup.scheduled, followup.due, followup.completed
visit.scheduled, visit.completed
deal.converted
auth.login, auth.logout
pii.key_rotated
```

## Next Steps (Phase 2)
- Idempotency middleware
- Optimistic concurrency (version column)
- Deduplication constraints

---

**Phase 1 Status: COMPLETE**
