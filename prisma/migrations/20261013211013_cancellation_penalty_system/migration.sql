-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'CANCELLATION_PENALTY';

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_recipientTenantId_fkey";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "claimId" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "lateFeeCents" INTEGER,
ADD COLUMN     "overdueEscalatedAt" TIMESTAMP(3),
ADD COLUMN     "recipientFreelancerId" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ALTER COLUMN "timesheetId" DROP NOT NULL,
ALTER COLUMN "recipientTenantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TenantCredit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceClaimId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "appliedToInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantCredit_tenantId_appliedAt_idx" ON "TenantCredit"("tenantId", "appliedAt");

-- CreateIndex
CREATE INDEX "Invoice_claimId_idx" ON "Invoice"("claimId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recipientTenantId_fkey" FOREIGN KEY ("recipientTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recipientFreelancerId_fkey" FOREIGN KEY ("recipientFreelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCredit" ADD CONSTRAINT "TenantCredit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
