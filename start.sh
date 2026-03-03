#!/bin/bash
# PropAgent Startup Script

echo "🏢 PropAgent - Real Estate Sales Intelligence"
echo "=============================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check PostgreSQL
if command -v psql &> /dev/null; then
    echo -e "${GREEN}✓ PostgreSQL found${NC}"
else
    echo -e "${YELLOW}PostgreSQL not found - install with: pkg install postgresql${NC}"
fi

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build packages
echo "Building packages..."
npm run build --workspaces --if-present

# Run migrations
echo "Running migrations..."
cd packages/db && npm run migrate && npm run seed && cd ../..

# Start services
echo "Starting services..."

nohup npm run dev --workspace=@propagent/ingestion > logs/ingestion.log 2>&1 &
nohup npm run dev --workspace=@propagent/whatsapp > logs/whatsapp.log 2>&1 &
nohup npm run dev --workspace=@propagent/commute > logs/commute.log 2>&1 &
nohup npm run dev --workspace=@propagent/analytics > logs/analytics.log 2>&1 &

sleep 3

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}🏢 PropAgent is running!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Services:"
echo "  - Ingestion:  http://localhost:4000"
echo "  - WhatsApp:   http://localhost:4001"
echo "  - Commute:    http://localhost:4002"
echo "  - Analytics:  http://localhost:4003"
echo ""
echo "Endpoints:"
echo "  POST /webhook/meta          - Meta Lead Ads"
echo "  POST /webhook/:source       - 99acres/MagicBricks"
echo "  POST /api/leads             - Manual lead entry"
echo "  GET  /api/analytics/summary - Dashboard data"
echo ""
