-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "ApiSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiSubscription_tenantId_key" ON "ApiSubscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiSubscription_stripeSubscriptionId_key" ON "ApiSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "ApiSubscription_status_idx" ON "ApiSubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeCustomerId_key" ON "Tenant"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "ApiSubscription" ADD CONSTRAINT "ApiSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
