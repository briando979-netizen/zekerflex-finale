# Stripe Sandbox Test Guide

**Objective:** Prove end-to-end payment flow works  
**Environment:** Stripe Sandbox (test keys only, no real money)  
**Duration:** ~15 minutes  

---

## Setup

1. **Stripe Dashboard:** https://dashboard.stripe.com/test/dashboard
2. **Test Keys** (in `.env.test`):
   ```
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   ```
3. **Webhook Secret:**
   ```
   STRIPE_WEBHOOK_SECRET=whsec_test_...
   ```

---

## Test Card Numbers (Sandbox)

| Card | Number | Exp | CVC | Behavior |
|------|--------|-----|-----|----------|
| **Success** | 4242 4242 4242 4242 | 12/26 | 123 | ✅ Charge succeeds |
| **Declined** | 4000 0000 0000 0002 | 12/26 | 123 | ❌ Card declined |
| **3D Secure** | 4000 0025 0000 3155 | 12/26 | 123 | ⏳ Requires verification |
| **Refund** | 4000 0000 0000 0127 | 12/26 | 123 | ♻️ Succeeds then refund works |

---

## Test Flows

### Flow 1: Employer creates shift → Worker applies → Timesheet approval → Invoice → Payout

```bash
# 1. Start dev server
npm run dev

# 2. Login as employer
# Email: hq@supermarktketen.nl
# Password: LocalDevPassword_ChangeMe

# 3. Create a shift
POST /api/shifts/create
{
  "title": "Test Shift",
  "amount_cents": 5000,  // €50 for easy tracking
  "duration_minutes": 480,
  "location": "Amsterdam"
}
// Returns: { shiftId: "xyz" }

# 4. Login as freelancer
# Email: sam.bronze@freelancer.nl
# Password: LocalDevPassword_ChangeMe

# 5. Apply to shift
POST /api/shifts/{shiftId}/apply
{
  "message": "I can do this shift"
}
// Returns: { applicationId: "abc" }

# 6. Login as manager
// Approve the shift
POST /api/shifts/{shiftId}/approve?applicationId=abc

# 7. Freelancer submits hours
POST /api/timesheets/submit
{
  "shiftId": "xyz",
  "hours": 8,
  "notes": "Completed as agreed"
}

# 8. Manager approves timesheet
POST /api/timesheets/{id}/approve
// Triggers invoice + payout

# 9. Check Stripe webhook was received
GET /api/admin/webhooks/recent
// Should show: { id: "evt_test_...", type: "charge.succeeded" }
```

---

### Flow 2: Payment Card Test

```bash
# 1. In employer dashboard, trigger payment
POST /api/billing/invoice/{invoiceId}/pay
{
  "payment_method": "card"
}

# 2. Frontend shows Stripe Checkout
// User selects test card: 4242 4242 4242 4242

# 3. Backend verifies webhook
// Check database: 
SELECT * FROM payments 
WHERE status='succeeded' 
ORDER BY created_at DESC LIMIT 1;
// Should show one row with amount_cents = 5000

# 4. Payout processed
// For freelancer:
SELECT * FROM payouts 
WHERE status='pending' OR status='completed'
ORDER BY created_at DESC LIMIT 1;
```

---

### Flow 3: Refund Test

```bash
# 1. Create successful charge first
// Use card: 4242 4242 4242 4242

# 2. Trigger refund
POST /api/billing/refund/{paymentId}

# 3. Check webhook
// Dashboard → Payments → Should show "refunded"

# 4. Verify in database
SELECT * FROM payment_refunds
WHERE payment_id = 'pay_...'
ORDER BY created_at DESC LIMIT 1;
```

---

## Expected Results

### Success Scenario ✅

```
1. Charge created: charge_test_xxxxx
2. Webhook received: charge.succeeded
3. Invoice marked: status='paid'
4. Payout initiated: status='pending'
5. Database shows: payment amount_cents=5000, status='succeeded'
```

### Webhook Verification

```bash
curl -X GET https://localhost:3000/api/admin/webhooks/recent \
  -H "Authorization: Bearer <admin-token>"

Response:
{
  "webhooks": [
    {
      "id": "evt_test_xxx",
      "type": "charge.succeeded",
      "created": "2026-11-08T14:30:00Z",
      "data": {
        "object": {
          "id": "ch_test_xxx",
          "amount": 5000,
          "currency": "eur"
        }
      },
      "processed": true,
      "processed_at": "2026-11-08T14:30:01Z"
    }
  ]
}
```

---

## Failure Recovery

| Issue | Cause | Fix |
|-------|-------|-----|
| "Invalid API key" | Wrong test key | Check `.env.test`, use `pk_test_` not `pk_live_` |
| Webhook not received | Endpoint wrong | Verify `/api/webhooks/stripe/route.ts` exists |
| "Charge declined" | Used wrong card | Use `4242 4242 4242 4242` for success |
| Timeout on payment | Database disconnected | Check `DATABASE_URL`, restart Docker Postgres |
| "Webhook signature invalid" | Wrong secret | Check `STRIPE_WEBHOOK_SECRET` matches dashboard |

---

## Proof (for audit)

When flows succeed, save:

```bash
# Screenshot of Stripe Dashboard → Payments (shows test charge)
# Database query result:
SELECT COUNT(*) as payments_succeeded, 
       SUM(amount_cents) as total_eur 
FROM payments 
WHERE status='succeeded';

# Expected output:
payments_succeeded | total_eur
1                  | 5000

# Webhook log:
cat logs/webhooks.log | grep "charge.succeeded"
```

---

**Target:** All 3 flows green ✅ by **end of test day**
