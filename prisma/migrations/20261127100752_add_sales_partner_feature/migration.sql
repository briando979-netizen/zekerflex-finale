-- CreateEnum for SalesPartnerStatus
CREATE TYPE "SalesPartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum for BusinessLeadStatus
CREATE TYPE "BusinessLeadStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONTACTED', 'CONVERTED');

-- CreateTable SalesPartnerProfile
CREATE TABLE "SalesPartnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SalesPartnerStatus" NOT NULL DEFAULT 'PENDING',
    "companyName" TEXT,
    "companyRegistration" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "commissionModel" TEXT NOT NULL DEFAULT 'model_a',
    "commissionRate" DOUBLE PRECISION,
    "businessesSubmitted" INTEGER NOT NULL DEFAULT 0,
    "businessesApproved" INTEGER NOT NULL DEFAULT 0,
    "totalCommissionCents" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "bankAccount" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable SalesPartnerBusiness
CREATE TABLE "SalesPartnerBusiness" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" "BusinessLeadStatus" NOT NULL DEFAULT 'PENDING',
    "businessName" TEXT NOT NULL,
    "kvkNumber" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "sector" TEXT,
    "estimatedEmployees" INTEGER,
    "website" TEXT,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "commissionCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPartnerBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable SalesPartnerCommission
CREATE TABLE "SalesPartnerCommission" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "commissionModel" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "taxesCents" INTEGER NOT NULL DEFAULT 0,
    "netAmountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "csvExportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPartnerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesPartnerProfile_userId_key" ON "SalesPartnerProfile"("userId");

-- CreateIndex
CREATE INDEX "SalesPartnerProfile_status_idx" ON "SalesPartnerProfile"("status");

-- CreateIndex
CREATE INDEX "SalesPartnerProfile_userId_idx" ON "SalesPartnerProfile"("userId");

-- CreateIndex
CREATE INDEX "SalesPartnerBusiness_partnerId_status_idx" ON "SalesPartnerBusiness"("partnerId", "status");

-- CreateIndex
CREATE INDEX "SalesPartnerBusiness_status_idx" ON "SalesPartnerBusiness"("status");

-- CreateIndex
CREATE INDEX "SalesPartnerBusiness_approvedAt_idx" ON "SalesPartnerBusiness"("approvedAt");

-- CreateIndex
CREATE INDEX "SalesPartnerBusiness_kvkNumber_idx" ON "SalesPartnerBusiness"("kvkNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPartnerCommission_partnerId_periodStart_periodEnd_key" ON "SalesPartnerCommission"("partnerId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SalesPartnerCommission_partnerId_status_idx" ON "SalesPartnerCommission"("partnerId", "status");

-- CreateIndex
CREATE INDEX "SalesPartnerCommission_periodStart_idx" ON "SalesPartnerCommission"("periodStart");

-- AddForeignKey
ALTER TABLE "SalesPartnerProfile" ADD CONSTRAINT "SalesPartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPartnerBusiness" ADD CONSTRAINT "SalesPartnerBusiness_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPartnerBusiness" ADD CONSTRAINT "SalesPartnerBusiness_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPartnerCommission" ADD CONSTRAINT "SalesPartnerCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
