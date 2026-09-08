-- Stripe Checkout for employer invoice payments (platform fee + self-bill).
-- Independent of the existing Payment/SEPA model, which only covers the
-- outbound freelancer payout.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_stripePaymentIntentId_key" ON "Invoice"("stripePaymentIntentId");
