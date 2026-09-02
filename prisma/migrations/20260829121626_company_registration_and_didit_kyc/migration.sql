-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'DISSOLVED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "FreelancerProfile" ADD COLUMN     "companyRegistrationId" TEXT,
ADD COLUMN     "kvkVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IdentityVerification" ADD COLUMN     "decisionStatus" TEXT,
ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "sessionUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "vendorData" TEXT,
ADD COLUMN     "workflowId" TEXT,
ALTER COLUMN "provider" SET DEFAULT 'DIDIT',
ALTER COLUMN "documentType" DROP NOT NULL,
ALTER COLUMN "documentNumberHash" DROP NOT NULL,
ALTER COLUMN "livenessScore" DROP NOT NULL,
ALTER COLUMN "faceMatchScore" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "rawPayload" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "companyRegistrationId" TEXT;

-- CreateTable
CREATE TABLE "DiditWebhookEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "webhookType" TEXT,
    "signatureValid" BOOLEAN NOT NULL,
    "signatureMethod" TEXT,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiditWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyRegistration" (
    "id" TEXT NOT NULL,
    "kvkNumber" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'KVKBASE',
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "legalForm" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'UNKNOWN',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "establishmentNumber" TEXT,
    "street" TEXT,
    "houseNumber" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NL',
    "sbiCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "foundationDate" TIMESTAMP(3),
    "employeeCount" INTEGER,
    "rawProfile" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiditWebhookEvent_sessionId_idx" ON "DiditWebhookEvent"("sessionId");

-- CreateIndex
CREATE INDEX "DiditWebhookEvent_receivedAt_idx" ON "DiditWebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRegistration_kvkNumber_key" ON "CompanyRegistration"("kvkNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FreelancerProfile_companyRegistrationId_key" ON "FreelancerProfile"("companyRegistrationId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityVerification_sessionId_key" ON "IdentityVerification"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_companyRegistrationId_key" ON "Tenant"("companyRegistrationId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_companyRegistrationId_fkey" FOREIGN KEY ("companyRegistrationId") REFERENCES "CompanyRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreelancerProfile" ADD CONSTRAINT "FreelancerProfile_companyRegistrationId_fkey" FOREIGN KEY ("companyRegistrationId") REFERENCES "CompanyRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

