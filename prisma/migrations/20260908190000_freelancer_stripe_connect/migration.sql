-- Stripe Connect Express onboarding for freelancer payouts (replaces the
-- generic PSD2/SEPA path when connected).
ALTER TABLE "FreelancerProfile" ADD COLUMN IF NOT EXISTS "stripeConnectedAccountId" TEXT;
ALTER TABLE "FreelancerProfile" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "FreelancerProfile_stripeConnectedAccountId_key" ON "FreelancerProfile"("stripeConnectedAccountId");
