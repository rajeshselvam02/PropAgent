#!/bin/bash
# Analytics Service Endpoints Test
# Run after starting the analytics service: npm run dev --workspace=@propagent/analytics

BASE_URL="http://localhost:4003"

echo "Testing Analytics Service Endpoints..."
echo "======================================"
echo ""

# 1. Health check
echo "1. Health Check"
curl -s "$BASE_URL/health" | jq .
echo ""

# 2. Funnel
echo "2. Conversion Funnel"
curl -s "$BASE_URL/api/analytics/funnel?from=2026-01-01&to=2026-03-04" | jq .
echo ""

# 3. Time to Conversion
echo "3. Time to Conversion (by source)"
curl -s "$BASE_URL/api/analytics/time-to-conversion?from=2026-01-01&to=2026-03-04&groupBy=source" | jq .
echo ""

echo "3b. Time to Conversion (by agent)"
curl -s "$BASE_URL/api/analytics/time-to-conversion?from=2026-01-01&to=2026-03-04&groupBy=agent" | jq .
echo ""

# 4. Agent Performance
echo "4. Agent Performance Leaderboard"
curl -s "$BASE_URL/api/analytics/agent-performance?from=2026-01-01&to=2026-03-04" | jq .
echo ""

# 5. Source ROI
echo "5. Source ROI Analysis"
curl -s "$BASE_URL/api/analytics/source-roi?from=2026-01-01&to=2026-03-04" | jq .
echo ""

# 6. Dashboard Summary
echo "6. Dashboard Summary"
curl -s "$BASE_URL/api/analytics/summary?from=2026-01-01&to=2026-03-04" | jq .
echo ""

# 7. Team Metrics (Manager Panel)
echo "7. Team Metrics (Manager Panel)"
curl -s "$BASE_URL/api/analytics/team-metrics?from=2026-01-01&to=2026-03-04" | jq .
echo ""

echo "======================================"
echo "All endpoints tested!"
