#!/bin/bash
# Start all PropAgent services

cd /root/.openclaw/workspace/PropAgent

export DATABASE_URL="postgresql://propagent:propagent123@localhost:5432/propagent"
export REDIS_HOST="localhost"
export REDIS_PORT="6379"
export JWT_SECRET="propagent-jwt-secret-2024"
export JWT_REFRESH_SECRET="propagent-refresh-secret-2024"
export PII_ENCRYPTION_KEY="propagent-pii-key-32-chars-12345678"

echo "Starting PropAgent services..."

# Kill existing processes
pkill -f "node.*services/auth" 2>/dev/null
pkill -f "node.*services/ingestion" 2>/dev/null
pkill -f "node.*services/analytics" 2>/dev/null
pkill -f "node.*services/worker" 2>/dev/null
pkill -f "next.*apps/web" 2>/dev/null

sleep 1

# Start Auth Service (port 4005)
echo "Starting Auth Service on port 4005..."
nohup npx ts-node services/auth/src/index.ts > logs/auth.log 2>&1 &
sleep 2

# Start Ingestion Service (port 4000)
echo "Starting Ingestion Service on port 4000..."
nohup npx ts-node services/ingestion/src/index.ts > logs/ingestion.log 2>&1 &
sleep 2

# Start Analytics Service (port 4003)
echo "Starting Analytics Service on port 4003..."
nohup npx ts-node services/analytics/src/index.ts > logs/analytics.log 2>&1 &
sleep 2

# Start Worker Service
echo "Starting Worker Service..."
nohup npx ts-node services/worker/src/worker.ts > logs/worker.log 2>&1 &
sleep 2

# Start Web UI (port 3000)
echo "Starting Web UI on port 3000..."
cd apps/web
nohup npm run dev > ../../logs/web.log 2>&1 &
cd ../..

echo ""
echo "==========================================="
echo "PropAgent Services Started!"
echo "==========================================="
echo ""
echo "Services:"
echo "  - Auth:       http://localhost:4005"
echo "  - Ingestion:  http://localhost:4000"
echo "  - Analytics:  http://localhost:4003"
echo "  - Web UI:     http://localhost:3000"
echo ""
echo "Logs: /root/.openclaw/workspace/PropAgent/logs/"
echo ""
echo "To stop all services: ./scripts/stop-services.sh"
