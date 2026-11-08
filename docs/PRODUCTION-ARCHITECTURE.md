# ZekerFlex Production Architecture

**Decision Date:** 8 November 2026  
**Status:** ✅ CHOSEN — VPS (Docker Compose + Caddy)  
**Not:** ~~Vercel~~ — VPS chosen for sovereignty & cost control

---

## Architecture Decision

| Component | Choice | Why |
|-----------|--------|-----|
| **Hosting** | TransIP VPS (37.97.226.24, 16GB RAM) | Own infrastructure, no vendor lock-in |
| **Container** | Docker Compose (`docker-compose.vps.yml`) | Multi-service orchestration, reproducible |
| **Reverse Proxy** | Caddy 2 | Auto-HTTPS, simple config, edge compute |
| **Database** | PostgreSQL 17 (managed container) | Prisma ORM, migrations tracked |
| **Cache** | Redis 7 (managed container) | Session, queue, real-time features |
| **Runtime** | Node.js 24 (standalone Next.js) | Production `next start`, NOT `next dev` |
| **CI/CD** | GitHub Actions → VPS SSH deploy | GitHub native, proven workflow |

---

## Start Sequence (Production)

```bash
# 1. Build (CI runs this, creates .next/)
npm ci
npx tsc --noEmit -p .
npx next build

# 2. Deploy (push to VPS via GitHub Actions)
git push origin main
# → .github/workflows/deploy-vps.yml triggers
# → SSH into VPS
# → git pull origin main
# → docker-compose up -d
# → health check /api/health

# 3. Never do this:
# ❌ next dev (dev server only)
# ❌ npm start (not configured)
# ❌ node .next/standalone (missing env setup)
```

---

## Env Variables (Production)

Set in VPS `.env.production` (600 perms, root only):

```bash
# Authentication
AUTH_SECRET=<64-char-generated>
AUTH_URL=https://zekerflex.nl

# Database
DATABASE_URL=postgresql://zekerflex:pwd@postgres:5432/zekerflex

# Redis
REDIS_URL=redis://redis:6379

# Stripe (LIVE keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...

# AI (Gemini or Ollama)
AI_ALLOW_REMOTE=true  # Use Gemini
GEMINI_API_KEY=...

# Logging & Monitoring
SENTRY_DSN=https://...
LOG_LEVEL=info
```

---

## Health Check (verify production is alive)

```bash
curl -s https://zekerflex.nl/api/health | jq .

# Response:
{
  "status": "ok",
  "timestamp": "2026-11-08T14:30:00Z",
  "database": "ok",
  "redis": "ok",
  "version": "next-15.5.28"
}
```

---

## Rollback (if deploy breaks production)

```bash
# 1. On VPS
ssh briando@37.97.226.24
cd ~/zekerflex

# 2. Check last known-good commit
git log --oneline | head -5

# 3. Rollback
git reset --hard <good-commit-sha>
docker-compose up -d --no-deps app
curl https://zekerflex.nl/api/health
```

---

## NOT Production

- ❌ Vercel (checked but ruled out — VPS chosen for control)
- ❌ Heroku (we have own VPS)
- ❌ AWS Elastic Beanstalk (too complex for our scale)
- ❌ Local laptop (only for dev)

---

**Next:** Verify build & tests pass (see BUILD-VERIFICATION.md)
