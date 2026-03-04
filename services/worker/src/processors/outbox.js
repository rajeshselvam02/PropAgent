"use strict";
/**
 * Outbox Pattern Implementation
 *
 * Ensures reliable event emission:
 * 1. Write event to outbox_events table (same transaction as business change)
 * 2. Worker polls unpublished events and publishes them
 * 3. Mark as published after successful delivery
 *
 * This prevents "DB updated but event not sent" failures.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOutboxEvent = createOutboxEvent;
exports.createOutboxEvents = createOutboxEvents;
exports.processOutboxPublish = processOutboxPublish;
exports.pollUnpublishedEvents = pollUnpublishedEvents;
exports.getEntityEvents = getEntityEvents;
exports.getEventsByType = getEventsByType;
const db_1 = __importDefault(require("@propagent/db"));
const config_1 = require("../config");
/**
 * Create an outbox event (call this from services)
 * IMPORTANT: Must be in same transaction as the business change
 */
async function createOutboxEvent(params) {
    const result = await db_1.default.query(`
    INSERT INTO outbox_events (
      tenant_id, event_type, entity_type, entity_id, actor_user_id, payload, schema_version
    ) VALUES ($1, $2, $3, $4, $5, $6, 1)
    RETURNING id
  `, [
        params.tenantId,
        params.eventType,
        params.entityType,
        params.entityId,
        params.actorUserId || null,
        JSON.stringify(params.payload),
    ]);
    return result.rows[0].id;
}
/**
 * Batch create outbox events (for transactions with multiple events)
 */
async function createOutboxEvents(events) {
    const ids = [];
    for (const event of events) {
        const id = await createOutboxEvent(event);
        ids.push(id);
    }
    return ids;
}
/**
 * Process outbox publisher job
 * Polls for unpublished events and emits them
 */
async function processOutboxPublish(job) {
    const { eventId } = job.data;
    console.log(`[outbox.publish] Publishing event ${eventId}`);
    // Get event
    const eventResult = await db_1.default.query(`
    SELECT * FROM outbox_events WHERE id = $1 AND published_at IS NULL
  `, [eventId]);
    if (eventResult.rows.length === 0) {
        // Already published or doesn't exist
        return { success: true, reason: 'already_published_or_not_found' };
    }
    const event = eventResult.rows[0];
    try {
        // Emit event to event bus
        // For now, we store in a materialized events table
        // In production, this would publish to Redis Streams, Kafka, etc.
        await emitEvent(event);
        // Mark as published
        await db_1.default.query(`
      UPDATE outbox_events 
      SET published_at = NOW(), attempts = attempts + 1
      WHERE id = $1
    `, [eventId]);
        return { success: true, eventId, eventType: event.event_type };
    }
    catch (error) {
        // Increment attempt count
        await db_1.default.query(`
      UPDATE outbox_events 
      SET attempts = attempts + 1, last_error = $2
      WHERE id = $1
    `, [eventId, error.message || String(error)]);
        throw error; // Let BullMQ handle retry
    }
}
/**
 * Poll for unpublished events
 * Called by scheduler
 */
async function pollUnpublishedEvents(limit = 100) {
    const result = await db_1.default.query(`
    SELECT id FROM outbox_events
    WHERE published_at IS NULL
      AND attempts < 8
    ORDER BY occurred_at ASC
    LIMIT $1
  `, [limit]);
    return result.rows.map((r) => r.id);
}
/**
 * Emit event to event bus
 * Routes events to appropriate handlers
 */
async function emitEvent(event) {
    // Store in domain_events for querying
    await db_1.default.query(`
    INSERT INTO domain_events (
      id, tenant_id, event_type, entity_type, entity_id,
      actor_user_id, payload, schema_version, occurred_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)
  `, [
        event.id,
        event.tenant_id,
        event.event_type,
        event.entity_type,
        event.entity_id,
        event.actor_user_id,
        event.payload,
        event.occurred_at,
    ]);
    // Route to specific handlers based on event type
    switch (event.event_type) {
        case config_1.DOMAIN_EVENTS.LEAD_CREATED:
            // Trigger WhatsApp welcome message
            console.log(`[events] Lead created: ${event.entity_id}, queueing welcome message`);
            break;
        case config_1.DOMAIN_EVENTS.LEAD_ASSIGNED:
            // Notify agent
            console.log(`[events] Lead assigned: ${event.entity_id}`);
            break;
        case config_1.DOMAIN_EVENTS.LEAD_STATUS_CHANGED:
            // Update analytics
            console.log(`[events] Lead status changed: ${event.entity_id}`);
            break;
        case config_1.DOMAIN_EVENTS.FOLLOWUP_DUE:
            // Send reminder
            console.log(`[events] Follow-up due: ${event.entity_id}`);
            break;
        default:
            console.log(`[events] Unhandled event type: ${event.event_type}`);
    }
}
/**
 * Get event history for an entity
 */
async function getEntityEvents(entityType, entityId) {
    const result = await db_1.default.query(`
    SELECT * FROM domain_events
    WHERE entity_type = $1 AND entity_id = $2
    ORDER BY occurred_at ASC
  `, [entityType, entityId]);
    return result.rows;
}
/**
 * Get events by type for tenant
 */
async function getEventsByType(tenantId, eventType, limit = 100) {
    const result = await db_1.default.query(`
    SELECT * FROM domain_events
    WHERE tenant_id = $1 AND event_type = $2
    ORDER BY occurred_at DESC
    LIMIT $3
  `, [tenantId, eventType, limit]);
    return result.rows;
}
//# sourceMappingURL=outbox.js.map