# PropAgent API Documentation

## Lead Lifecycle Endpoints

### Mark Lead as Contacted
```http
PUT /api/leads/:id/contacted
Content-Type: application/json

{
  "agent_id": "uuid",
  "notes": "Called, discussed budget"
}
```

### Update Lead Status
```http
PUT /api/leads/:id/status
Content-Type: application/json

{
  "status": "qualified"
}
```

Valid statuses: `new`, `contacted`, `qualified`, `visit_scheduled`, `visit_completed`, `converted`, `lost`

### Calculate Intent Score
```http
POST /api/leads/:id/calculate-score
```

Response:
```json
{
  "success": true,
  "data": {
    "intent_score": 75,
    "intent_class": "hot"
  }
}
```

Scoring:
- Budget match: 10-30 points
- Timeline: 10-25 points (asap = max)
- Location: 20 points
- Purpose: 10-15 points
- Engagement: 10 points

Classification:
- Hot: score >= 70
- Warm: score >= 40
- Cold: score < 40

### Auto-Assign Lead
```http
POST /api/leads/:id/assign
```

Assigns to agent with least active leads (round-robin).

### Get Leads (Sorted by Priority)
```http
GET /api/leads?status=hot&agent_id=uuid&limit=20&offset=0
```

Returns leads sorted by:
1. Intent class (hot → warm → cold)
2. Created at (newest first)

### Schedule Follow-up
```http
POST /api/leads/:id/follow-up
Content-Type: application/json

{
  "scheduled_at": "2026-03-05T10:00:00Z",
  "notes": "Call to confirm visit"
}
```

### Get Overdue Follow-ups
```http
GET /api/follow-ups/overdue
```

Returns leads with `next_follow_up_at < NOW()` and status not in `converted`, `lost`.

## Agent Assignment Logic

**Round-Robin with Load Balancing:**
1. Find all active agents
2. Count active leads per agent (status NOT IN converted/lost)
3. Assign to agent with lowest count
4. Tie-breaker: random selection

## Lead Lifecycle Flow

```
NEW → CONTACTED → QUALIFIED → VISIT_SCHEDULED → VISIT_COMPLETED → CONVERTED
                                         ↓
                                      LOST
```

## Webhook Integration

### Meta Lead Ads
```http
POST /webhook/meta
X-Hub-Signature-256: sha256=...

{
  "entry": [{
    "changes": [{
      "value": {
        "field_data": [
          {"name": "full_name", "values": ["Ramesh Kumar"]},
          {"name": "phone_number", "values": ["+919876543210"]}
        ]
      }
    }]
  }]
}
```

### Generic Lead Source
```http
POST /webhook/:source
Content-Type: application/json

{
  "name": "Ramesh Kumar",
  "phone": "+91-98765-43210",
  "email": "ramesh@email.com",
  "project": "Emerald Villas"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Invalid input / Missing required field |
| 401 | Invalid API key |
| 404 | Lead not found |
| 409 | Duplicate phone number |
| 429 | Rate limit exceeded |
