/**
 * Optimistic Concurrency Control
 *
 * Implements version-based optimistic locking for safe concurrent updates:
 * - Each record has a `version` field (integer, auto-incremented)
 * - UPDATE queries must include `WHERE version = $expected`
 * - Returns 409 Conflict on stale writes
 *
 * Usage:
 *   GET: Return ETag header with current version
 *   PUT: Check If-Match header, validate version, return 409 on mismatch
 */

import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Concurrency error codes
 */
export const CONFLICT_CODES = {
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  STALE_DATA: 'STALE_DATA',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
} as const;

/**
 * Parse If-Match header to get expected version
 * 
 * If-Match: "123" or If-Match: 123
 */
export function parseIfMatch(header: string | undefined): number | null {
  if (!header) return null;

  // Handle quoted format: "123"
  const quotedMatch = header.match(/^"(\d+)"$/);
  if (quotedMatch) return parseInt(quotedMatch[1], 10);

  // Handle unquoted format: 123
  const directMatch = header.match(/^(\d+)$/);
  if (directMatch) return parseInt(directMatch[1], 10);

  return null;
}

/**
 * Format version for ETag header
 * 
 * Returns quoted version string: "123"
 */
export function formatETag(version: number): string {
  return `"${version}"`;
}

/**
 * Fastify middleware for optimistic concurrency
 * 
 * Validates If-Match header against resource version
 */
export function concurrencyMiddleware(entityType: string, getVersion: (id: string, tenantId: string) => Promise<number | null>) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    if (req.method !== 'PUT' && req.method !== 'PATCH') return true;

    const ifMatch = req.headers['if-match'];
    if (!ifMatch) {
      reply.code(428).send({
        error: 'If-Match header required for updates',
        code: 'MISSING_IF_MATCH'
      });
      return false;
    }

    const expectedVersion = parseIfMatch(ifMatch as string);
    if (expectedVersion === null) {
      reply.code(400).send({
        error: 'Invalid If-Match header format',
        code: 'INVALID_IF_MATCH'
      });
      return false;
    }

    // Get resource ID from params
    const resourceId = (req.params as any)?.id;
    if (!resourceId) {
      reply.code(400).send({
        error: 'Resource ID required',
        code: 'MISSING_RESOURCE_ID'
      });
      return false;
    }

    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      reply.code(401).send({
        error: 'Tenant context required',
        code: 'MISSING_TENANT'
      });
      return false;
    }

    try {
      const currentVersion = await getVersion(resourceId, tenantId);

      if (currentVersion === null) {
        reply.code(404).send({
          error: `${entityType} not found`,
          code: 'NOT_FOUND'
        });
        return false;
      }

      if (currentVersion !== expectedVersion) {
        reply.code(409).send({
          error: 'Resource has been modified by another request',
          code: CONFLICT_CODES.VERSION_MISMATCH,
          currentVersion,
          expectedVersion,
          hint: 'Fetch the latest version and retry'
        });
        return false;
      }

      // Attach version to request for use in update
      (req as any)._expectedVersion = expectedVersion;

      return true;
    } catch (err) {
      req.log.error({ err, resourceId, entityType }, 'Concurrency check failed');
      reply.code(500).send({
        error: 'Internal error during concurrency check',
        code: 'INTERNAL_ERROR'
      });
      return false;
    }
  };
}

/**
 * Build UPDATE query with optimistic locking
 * 
 * Returns: { query, params, rows, conflictHandling }
 */
export function buildVersionedUpdate(
  table: string,
  id: string,
  tenantId: string,
  expectedVersion: number,
  updates: Record<string, any>
): { query: string; params: any[] } {
  const keys = Object.keys(updates);
  const setClauses: string[] = ['version = version + 1', 'updated_at = NOW()'];
  const params: any[] = [];
  
  keys.forEach((key, index) => {
    setClauses.push(`${key} = $${index + 1}`);
    params.push(updates[key]);
  });

  // Add WHERE clause params
  params.push(id, tenantId, expectedVersion);

  const query = `
    UPDATE ${table}
    SET ${setClauses.join(', ')}
    WHERE id = $${params.length - 2}
      AND tenant_id = $${params.length - 1}
      AND version = $${params.length}
    RETURNING *
  `;

  return { query, params };
}

/**
 * Execute versioned update and handle conflicts
 */
export async function executeVersionedUpdate(
  db: any,
  table: string,
  id: string,
  tenantId: string,
  expectedVersion: number,
  updates: Record<string, any>
): Promise<{ success: boolean; data?: any; conflict?: boolean }> {
  const { query, params } = buildVersionedUpdate(table, id, tenantId, expectedVersion, updates);

  const result = await db.query(query, params);

  if (result.rows.length === 0) {
    // Either not found or version mismatch
    // Check if record exists
    const check = await db.query(
      `SELECT version FROM ${table} WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (check.rows.length === 0) {
      return { success: false, conflict: false }; // Not found
    }

    return { success: false, conflict: true }; // Version mismatch
  }

  return { success: true, data: result.rows[0] };
}

/**
 * Add ETag header to GET response
 */
export function addETagHeader(reply: FastifyReply, version: number): void {
  reply.header('ETag', formatETag(version));
}

/**
 * Concurrency-aware GET handler
 * 
 * Fetches entity and adds ETag header
 */
export async function concurrencyAwareGet(
  db: any,
  table: string,
  id: string,
  tenantId: string,
  reply: FastifyReply
): Promise<any | null> {
  const result = await db.query(
    `SELECT * FROM ${table} WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  if (result.rows.length === 0) return null;

  const entity = result.rows[0];

  // Add ETag header if version exists
  if (entity.version !== undefined) {
    addETagHeader(reply, entity.version);
  }

  return entity;
}

/**
 * Batch version check for bulk operations
 * 
 * Returns map of id -> version mismatch error (if any)
 */
export async function batchVersionCheck(
  db: any,
  table: string,
  updates: Array<{ id: string; expectedVersion: number }>,
  tenantId: string
): Promise<Map<string, { currentVersion: number; expectedVersion: number } | null>> {
  const mismatches = new Map<string, { currentVersion: number; expectedVersion: number } | null>();

  if (updates.length === 0) return mismatches;

  const ids = updates.map(u => u.id);
  const result = await db.query(
    `SELECT id, version FROM ${table} WHERE id = ANY($1) AND tenant_id = $2`,
    [ids, tenantId]
  );

  // The type of `versionMap` is inferred as `Map<string, unknown>` because `r.version` could be `null`.
  // We need to ensure it's `Map<string, number>` by casting or providing an explicit type.
  const versionMap = new Map<string, number>(result.rows.map((r: { id: string; version: number }) => [r.id, r.version]));

  for (const update of updates) {
    const currentVersion = versionMap.get(update.id);

    if (currentVersion === undefined) {
      mismatches.set(update.id, null); // Not found
    } else if (currentVersion !== update.expectedVersion) {
      mismatches.set(update.id, { currentVersion: currentVersion as number, expectedVersion: update.expectedVersion });
    }
  }

  return mismatches;
}
