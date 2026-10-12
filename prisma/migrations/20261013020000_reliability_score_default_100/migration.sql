-- AlterTable
ALTER TABLE "FreelancerProfile" ALTER COLUMN "reliabilityScore" SET DEFAULT 1.0;

-- Backfill: every existing profile still sitting at the old default (0.7)
-- has never actually been adjusted by anything (no code path updates this
-- field after creation) — it's their starting value, not an earned score,
-- so it moves to the new default too. A profile that happens to have been
-- manually set to exactly 0.7 on purpose is indistinguishable from this and
-- is swept up the same way; there is no real adjustment history to lose.
UPDATE "FreelancerProfile" SET "reliabilityScore" = 1.0 WHERE "reliabilityScore" = 0.7;
