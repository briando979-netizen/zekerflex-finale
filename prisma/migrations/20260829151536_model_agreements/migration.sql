-- CreateEnum
CREATE TYPE "ModelAgreementType" AS ENUM ('VRIJE_VERVANGING', 'GEEN_WERKGEVERSGEZAG', 'TUSSENKOMST', 'BRANCHE');

-- CreateEnum
CREATE TYPE "ModelAgreementStatus" AS ENUM ('DRAFT', 'PENDING_FREELANCER_SIGNATURE', 'PENDING_CLIENT_SIGNATURE', 'ACTIVE', 'DECLINED', 'SUPERSEDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ModelAgreement" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "shiftId" TEXT,
    "assignmentId" TEXT,
    "type" "ModelAgreementType" NOT NULL DEFAULT 'VRIJE_VERVANGING',
    "status" "ModelAgreementStatus" NOT NULL DEFAULT 'PENDING_FREELANCER_SIGNATURE',
    "templateKey" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "belastingdienstNr" TEXT,
    "freelancerLegalName" TEXT NOT NULL,
    "freelancerKvkNumber" TEXT NOT NULL,
    "clientLegalName" TEXT NOT NULL,
    "clientKvkNumber" TEXT,
    "hourlyRateCents" INTEGER,
    "scopeDescription" TEXT,
    "freelancerSignedAt" TIMESTAMP(3),
    "clientSignedAt" TIMESTAMP(3),
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelAgreement_reference_key" ON "ModelAgreement"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ModelAgreement_assignmentId_key" ON "ModelAgreement"("assignmentId");

-- CreateIndex
CREATE INDEX "ModelAgreement_freelancerId_status_idx" ON "ModelAgreement"("freelancerId", "status");

-- CreateIndex
CREATE INDEX "ModelAgreement_tenantId_status_idx" ON "ModelAgreement"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "ModelAgreement" ADD CONSTRAINT "ModelAgreement_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelAgreement" ADD CONSTRAINT "ModelAgreement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelAgreement" ADD CONSTRAINT "ModelAgreement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelAgreement" ADD CONSTRAINT "ModelAgreement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelAgreement" ADD CONSTRAINT "ModelAgreement_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ShiftAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

