# PropAgent Production Deployment Checklist

## Security Checklist (Before Go-Live)

### Authentication & Authorization
- [ ] All endpoints require auth except `/health` and `/auth/*`
- [ ] Tenant isolation enforced in every SQL query
- [ ] Agent cannot access other agents' leads
- [ ] Manager-only actions protected
- [ ] Access tokens expire (15 min)
- [ ] Refresh tokens rotate on use
- [ ] Old refresh tokens revoked after rotation

### Key Management
- [ ] JWT keys support rotation via `kid` + JWKS
- [ ] PII encrypted at rest (AES-256-GCM)
- [ ] Hash columns used for exact lookups
- [ ] No secrets in logs or repo
- [ ] Keys stored in secret manager (prod) or `.env` (dev)

### Network Security
- [ ] Services not publicly exposed
- [ ] Only gateway/edge reachable externally
- [ ] HTTPS enabled in production
- [ ] Cookies set with `Secure` + `HttpOnly`

### Abuse Protection
- [ ] Rate limiting on auth endpoints
- [ ] Request validation on all inputs
- [ ] Payload size limits (1MB)
- [ ] Request timeouts configured

### Observability
- [ ] Structured JSON logging
- [ ] No PII/tokens in logs
- [ ] Request ID correlation across services
- [ ] Health check endpoints working
- [ ] Metrics endpoint (optional)

### Data Protection
- [ ] Database backups configured
- [ ] Restore procedure tested
- [ ] Audit log records all sensitive actions

---

## Deployment Steps

### 1. Pre-deployment
```bash
# Generate keys
openssl rand -hex 32 > .env.secret
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env.production
echo "APP_PII_KEY=$(openssl rand -hex 32)" >> .env.production

# Build
npm run build --workspaces
npm run migrate
```

### 2. Docker Deployment
```bash
docker-compose -f docker-compose.prod.yml up -d
docker-compose logs -f
```

### 3. Post-deployment Verification
```bash
# Health check
curl https://your-domain/health

# Auth check
curl -X POST https://your-domain/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Verify HTTPS redirect
curl -I http://your-domain
# Should show 301 redirect to https://
```

---

## Security Headers Configuration

### Nginx
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### Rate Limits
| Endpoint | Limit | Window |
|----------|-------|--------|
| /auth/login | 5 | 1 min |
| /auth/refresh | 30 | 1 min |
| /api/* | 100 | 1 min |

---

## Incident Response

### Token Compromise
1. Rotate JWT signing key
2. Revoke all refresh tokens for affected tenant
3. Force password reset for affected users
4. Audit logs for suspicious activity

### Data Breach
1. Isolate affected services
2. Rotate all encryption keys
3. Re-encrypt PII with new key
4. Notify affected tenants
5. Document in audit log

### Key Rotation Procedure
```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Add to config (keep old key for decryption)
APP_PII_KEY_CURRENT=$NEW_KEY
APP_PII_KEY_PREVIOUS=$OLD_KEY

# Run re-encryption job
npm run pii-rotate
```

---

**Last Updated:** 2026-03-03
**Status:** Ready for review
