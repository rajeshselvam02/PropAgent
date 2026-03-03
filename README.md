# PropAgent - Real Estate Sales Intelligence

AI-powered lead management for real estate firms in Bangalore.

## Features

- **Lead Ingestion**: Meta Ads, 99acres, MagicBricks, WhatsApp
- **Lead Lifecycle**: New → Contacted → Qualified → Visit → Converted
- **Intent Scoring**: Dynamic scoring based on budget, timeline, location
- **Agent Assignment**: Round-robin with load balancing
- **WhatsApp Bot**: Automated qualification flow
- **Commute Service**: Cab booking and tracking for site visits
- **Authentication**: JWT + Refresh tokens, multi-tenancy, PII encryption
- **Analytics**: Real-time dashboard, agent leaderboard, source ROI

## Tech Stack

- **Backend**: Node.js, TypeScript, Fastify
- **Database**: PostgreSQL
- **Cache**: Redis
- **Auth**: JWT, bcrypt, AES-256-GCM

## Quick Start

```bash
# Install PostgreSQL
pkg install postgresql

# Start PostgreSQL
service postgresql start

# Create database
createdb propagent_dev

# Clone and setup
git clone <repo-url>
cd PropAgent
npm install

# Run migrations
cd packages/db && npm run migrate && npm run seed && cd ../..

# Start all services
./start.sh
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Ingestion | 4000 | Lead intake (Meta, 99acres, etc.) |
| WhatsApp | 4001 | WhatsApp bot integration |
| Commute | 4002 | Visit transport management |
| Analytics | 4003 | Dashboard & reporting |

## API Endpoints

### Lead Management
```
POST /webhook/meta              - Meta Lead Ads webhook
POST /webhook/:source           - 99acres/MagicBricks webhook
POST /api/leads                 - Manual lead entry
GET  /api/leads                 - List leads (with filters)
```

### Commute Management
```
POST /api/commute-requests      - Create commute request
GET  /api/commute-requests      - List pending requests
PUT  /api/commute-requests/:id/approve  - Approve request
PUT  /api/commute-requests/:id/assign-cab - Assign cab details
GET  /api/commute/stats         - Commute statistics
```

### Analytics
```
GET /api/analytics/summary      - Dashboard summary
GET /api/analytics/leaderboard  - Agent performance
GET /api/analytics/meta-campaigns - Meta Ads ROI
```

## Features

✅ Lead ingestion from multiple sources
✅ Meta Ads integration (Facebook/Instagram)
✅ WhatsApp bot (qualification flow)
✅ Site visit scheduling
✅ Commute service (cab management)
✅ Call recording & transcription
✅ Agent dashboard
✅ Manager panel
✅ Real-time analytics

## Next Steps

1. Integrate WhatsApp Business API (Gupshup/Twilio)
2. Build agent mobile app
3. Add call recording service
4. Implement qualification state machine

---

Built for Bangalore real estate 🏠
