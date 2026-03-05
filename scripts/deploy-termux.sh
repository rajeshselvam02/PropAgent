# PropAgent Deployment Script
# This script sets up and runs PropAgent on Termux

0. Initial Setup
   - PostgreSQL: Initialize and start
   - Redis: Start daemon
   - Database: Create propagent database and user

1. Install Dependencies
   - npm install in root
   - npm install in apps/web

2. Run Migrations
   - Auth migration
   - Worker migration
   - Idempotency migration
   - Analytics migration
   - Billing migration

3. Start Services (Background)
   - Auth service (port 4005)
   - Ingestion service (port 4000)
   - Analytics service (port 4003)
   - Worker service
   - Web UI (port 3000)

4. Capture Screenshots
   - Login page
   - Leads page
   - Pipeline
   - Analytics
   - Billing

5. Document Results
   - Save to docs/DEPLOYMENT-RESULTS.md
