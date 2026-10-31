-- CreateEnum
CREATE TYPE "ManagedWebsiteStatus" AS ENUM ('PENDING_PAYMENT', 'ONBOARDING', 'SUBMITTED', 'ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ManagedWebsite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "ManagedWebsiteStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "plan" TEXT,
    "domain" TEXT,
    "provider" TEXT,
    "notes" TEXT,
    "secretsSealed" TEXT,
    "secretsSetAt" TIMESTAMP(3),
    "stripeSubId" TEXT,
    "stripeSessionId" TEXT,
    "subscribedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedWebsite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagedWebsite_tenantId_key" ON "ManagedWebsite"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedWebsite_stripeSessionId_key" ON "ManagedWebsite"("stripeSessionId");

-- CreateIndex
CREATE INDEX "ManagedWebsite_status_idx" ON "ManagedWebsite"("status");

-- AddForeignKey
ALTER TABLE "ManagedWebsite" ADD CONSTRAINT "ManagedWebsite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
