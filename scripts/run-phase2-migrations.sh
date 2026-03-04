#!/bin/bash
# Run all migrations for Phase 2 (Idempotency + Concurrency)
#
# This script runs migrations in the correct order:
# 1. Base schema (migrate.ts)
# 2. Auth/multi-tenant (auth-migration.ts)
# 3. Worker/queues (worker-migration.ts)
# 4. Idempotency + concurrency (idempotency-migration.ts)

set -e

echo "=== Running Phase 2 Migrations ==="

cd "$(dirname "$0")/.."

# Run migrations in order
echo ""
echo "1/4 Base schema migration..."
npx ts-node packages/db/src/migrate.ts

echo ""
echo "2/4 Auth/multi-tenant migration..."
npx ts-node packages/db/src/auth-migration.ts

echo ""
echo "3/4 Worker/queues migration..."
npx ts-node packages/db/src/worker-migration.ts

echo ""
echo "4/4 Idempotency + concurrency migration..."
npx ts-node packages/db/src/idempotency-migration.ts

echo ""
echo "=== Phase 2 Migrations Complete ==="
