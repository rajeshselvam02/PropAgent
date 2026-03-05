#!/bin/bash
# PropAgent Cron Deployment Script
# Runs automatically to deploy and test PropAgent

LOG_FILE="/root/.openclaw/workspace/PropAgent/docs/deploy-log.txt"
REPORT_FILE="/root/.openclaw/workspace/PropAgent/docs/DEPLOYMENT-RESULTS.md"

echo "========================================" >> "$LOG_FILE"
echo "PropAgent Deployment - $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

cd /root/.openclaw/workspace/PropAgent

# Step 1: Start PostgreSQL
echo "[STEP 1] Starting PostgreSQL..." >> "$LOG_FILE"
su postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /var/lib/postgresql/17/main start" 2>&1 >> "$LOG_FILE" || echo "PostgreSQL already running or error" >> "$LOG_FILE"

# Step 2: Start Redis
echo "[STEP 2] Starting Redis..." >> "$LOG_FILE"
redis-cli ping 2>/dev/null || redis-server --daemonize yes >> "$LOG_FILE" 2>&1
echo "Redis started" >> "$LOG_FILE"

# Step 3: Create Database and User
echo "[STEP 3] Setting up database..." >> "$LOG_FILE"
su postgres -c "psql -c \"CREATE DATABASE propagent;\"" 2>&1 >> "$LOG_FILE" || echo "DB may already exist"
su postgres -c "psql -c \"CREATE USER propagent WITH PASSWORD 'propagent123';\"" 2>&1 >> "$LOG_FILE" || echo "User may already exist"
su postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE propagent TO propagent;\"" 2>&1 >> "$LOG_FILE"

# Step 4: Install Dependencies
echo "[STEP 4] Installing dependencies..." >> "$LOG_FILE"
npm install --silent 2>&1 >> "$LOG_FILE" || echo "npm install had issues"
cd apps/web && npm install --silent 2>&1 >> "$LOG_FILE" || echo "web npm install had issues"
cd ../..

# Step 5: Set Environment Variables
export DATABASE_URL="postgresql://propagent:propagent123@localhost:5432/propagent"
export REDIS_HOST="localhost"
export REDIS_PORT="6379"
export JWT_SECRET="propagent-jwt-secret-2024"
export JWT_REFRESH_SECRET="propagent-refresh-secret-2024"
export PII_ENCRYPTION_KEY="propagent-pii-key-32-chars-12345678"

# Step 6: Run Migrations
echo "[STEP 5] Running migrations..." >> "$LOG_FILE"
cd packages/db
npx ts-node src/migrate.ts 2>&1 >> "$LOG_FILE" || echo "Migration had issues"
npx ts-node src/auth-migration.ts 2>&1 >> "$LOG_FILE" || echo "Auth migration had issues"
npx ts-node src/worker-migration.ts 2>&1 >> "$LOG_FILE" || echo "Worker migration had issues"
npx ts-node src/idempotency-migration.ts 2>&1 >> "$LOG_FILE" || echo "Idempotency migration had issues"
npx ts-node src/analytics-migration.ts 2>&1 >> "$LOG_FILE" || echo "Analytics migration had issues"
npx ts-node src/billing-migration.ts 2>&1 >> "$LOG_FILE" || echo "Billing migration had issues"
cd ../..

echo "[STEP 6] Deployment complete!" >> "$LOG_FILE"
echo "Completed at $(date)" >> "$LOG_FILE"

# Generate Report
cat > "$REPORT_FILE" << REPORT
# PropAgent Deployment Results

## Deployment Summary
- **Date:** $(date)
- **Platform:** Termux/Android
- **Node.js:** $(node -v)
- **PostgreSQL:** 17
- **Redis:** $(redis-cli --version | head -1)

## Services Status

| Service | Status | Port |
|---------|--------|------|
| PostgreSQL | $(pg_isready -q && echo "✅ Running" || echo "❌ Not running") | 5432 |
| Redis | $(redis-cli ping 2>/dev/null || echo "❌ Not running") | 6379 |

## Database Setup
- Database: propagent
- User: propagent
- Tables: $(su postgres -c "psql -d propagent -t -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';\"" 2>/dev/null | tr -d ' ') tables created

## Next Steps
1. Start services: \`./scripts/start-services.sh\`
2. Access web UI: http://localhost:3000

## Log File
See: \`docs/deploy-log.txt\`
REPORT

echo "Report saved to $REPORT_FILE"
echo "Deployment completed at $(date)"
