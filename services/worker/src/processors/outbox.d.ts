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
import { Job } from 'bullmq';
interface OutboxPublishData {
    eventId: string;
}
interface CreateEventParams {
    tenantId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    actorUserId?: string;
    payload: Record<string, any>;
}
/**
 * Create an outbox event (call this from services)
 * IMPORTANT: Must be in same transaction as the business change
 */
export declare function createOutboxEvent(params: CreateEventParams): Promise<string>;
/**
 * Batch create outbox events (for transactions with multiple events)
 */
export declare function createOutboxEvents(events: CreateEventParams[]): Promise<string[]>;
/**
 * Process outbox publisher job
 * Polls for unpublished events and emits them
 */
export declare function processOutboxPublish(job: Job<OutboxPublishData>): Promise<{
    success: boolean;
    reason: string;
    eventId?: undefined;
    eventType?: undefined;
} | {
    success: boolean;
    eventId: string;
    eventType: any;
    reason?: undefined;
}>;
/**
 * Poll for unpublished events
 * Called by scheduler
 */
export declare function pollUnpublishedEvents(limit?: number): Promise<any>;
/**
 * Get event history for an entity
 */
export declare function getEntityEvents(entityType: string, entityId: string): Promise<any>;
/**
 * Get events by type for tenant
 */
export declare function getEventsByType(tenantId: string, eventType: string, limit?: number): Promise<any>;
export {};
//# sourceMappingURL=outbox.d.ts.map