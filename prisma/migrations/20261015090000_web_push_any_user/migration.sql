-- Web Push for every account (incoming calls, chat), not only freelancers.

-- AlterTable
ALTER TABLE "WebPushSubscription" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "freelancerId" DROP NOT NULL;

-- Backfill: existing subscriptions all belong to a freelancer profile.
UPDATE "WebPushSubscription" AS w
SET "userId" = f."userId"
FROM "FreelancerProfile" AS f
WHERE w."freelancerId" = f."id" AND w."userId" IS NULL;

-- CreateIndex
CREATE INDEX "WebPushSubscription_userId_idx" ON "WebPushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
