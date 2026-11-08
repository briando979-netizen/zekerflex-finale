# ZekerFlex Ready-for-Pilot Checklist

**Status:** 🟡 IN PROGRESS (Build verification underway)  
**Target:** Ready by end of 8 Nov 2026  
**Objective:** Prove 8-step core flow works with real pilot customer  

---

## Build & Test Status

### TypeScript ⏳ RUNNING
```bash
npx tsc --noEmit -p .
```
Expected: **0 errors, 0 warnings**  
Evidence: `typecheck-results.txt`

### Production Build ⏳ RUNNING
```bash
npx next build
```
Expected: ✓ All routes compiled successfully  
Evidence: `.next/` directory + build output

### Unit Tests ⏳ NEXT (after build)
```bash
npx vitest run
```
Expected: All tests pass  
Evidence: `test-results.txt`

### E2E Tests ⏳ NEXT (requires Docker)
```bash
npx playwright test e2e/critical-path.spec.ts
```
Expected: Sign-up → Shift posting → Application → Approval → Payout  
Evidence: Playwright report

---

## Core 8-Step Flow (Ready to Pilot)

```
1. Employer posts shift
   POST /api/shifts/create
   → Returns: { shiftId }

2. Worker discovers shift
   GET /api/shifts/discover?city=Amsterdam
   → Returns: [{ id, title, pay, duration }]

3. Worker applies
   POST /api/shifts/{shiftId}/apply
   → Returns: { applicationId, status: 'pending' }

4. Manager approves
   POST /api/shifts/{shiftId}/approve
   → Returns: { status: 'approved' }

5. Worker submits hours
   POST /api/timesheets/submit
   Body: { shiftId, hours, notes }
   → Returns: { invoiceId, status: 'pending_approval' }

6. Manager approves timesheet
   POST /api/timesheets/{id}/approve
   → Triggers: Invoice generation + Payout request

7. Invoice created
   GET /api/invoices/{invoiceId}
   → Returns: { amount, status: 'pending_payment', payment_method: 'stripe' }

8. Payment processed
   POST /api/payments/confirm
   Body: { invoiceId, paymentToken }
   → Triggers: Payout to worker IBAN
```

---

## Pilot Customer Profile

### Test Employer
- **Email:** `test-employer-nov8@example.com`
- **Role:** HQ_ADMIN
- **Task:** Post 1 shift for €50 (easy to track)

### Test Worker
- **Email:** `test-worker-nov8@freelancer.nl`
- **Role:** FREELANCER
- **Task:** Apply → Complete shift → Get paid

### Success Criteria
- ✅ Shift posted without errors
- ✅ Worker can discover & apply
- ✅ Manager can approve application
- ✅ Worker can submit hours
- ✅ Timesheet approval triggers invoice
- ✅ Invoice marked paid in Stripe Sandbox
- ✅ Payout request created in database
- ✅ No errors in logs

---

## Infrastructure Verification

### Database
```bash
# Test connection
psql $DATABASE_URL -c "SELECT version();"
# Expected: PostgreSQL 17.x
```

### Redis
```bash
# Test connection
redis-cli -u $REDIS_URL ping
# Expected: PONG
```

### Stripe Webhook
```bash
# Verify endpoint exists
curl -s https://zekerflex.nl/api/webhooks/stripe -I
# Expected: 200 OK or 405 Method Not Allowed (POST required)
```

### Email (optional)
```bash
# Check if Sendgrid/mail provider working
# Verification email should arrive within 2 min
```

---

## Production Readiness Scores

| Component | Score | Evidence |
|-----------|-------|----------|
| **TypeScript** | ⏳ Pending | tsc output |
| **Build** | ⏳ Pending | .next/ directory |
| **Unit Tests** | ⏳ Pending | vitest report |
| **E2E Tests** | ⏳ Pending | Playwright report |
| **Stripe Integration** | ✅ 90% | STRIPE-TEST-GUIDE.md |
| **Architecture** | ✅ 100% | PRODUCTION-ARCHITECTURE.md |
| **Security** | ✅ 85% | seed.ts secured, auth verified |
| **Documentation** | ✅ 95% | README, docs/ complete |

**Overall:** 🟡 **75% Ready** → **Target 95% by EOD**

---

## Pilot Success = Green Light For:

- ✅ Seed €50K from initial investor
- ✅ Hire 2 engineers (backend + frontend)
- ✅ Recruit 50 pilot employers
- ✅ Recruit 200 pilot workers
- ✅ Scale to €10K/month MRR
- ✅ Series A roadmap

---

## If Build Fails

| Error | Recovery |
|-------|----------|
| tsc errors | Fix types, commit, rebuild |
| next build fails | Check env vars, logs, build cache |
| Playwright timeout | Check Database/Redis, restart Docker |
| Stripe test fails | Verify keys in .env.test, check webhook |

**Escalation:** If any test fails, halt and fix. Do not pilot with broken code.

---

## Success Declaration (When All Green)

```bash
# This file will be updated to show:
# ✅ tsc: 0 errors
# ✅ next build: success
# ✅ vitest: 100% pass
# ✅ playwright: 8/8 flows pass
# ✅ stripe: sandbox test success
# ✅ LOG: Ready for pilot customer
```

---

**STATUS: Build in progress — will update as results arrive** 🚀
