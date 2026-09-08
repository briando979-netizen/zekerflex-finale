-- Moves metadata that used to live on local disk into Postgres. Vercel's
-- serverless functions have a read-only filesystem outside /tmp (and /tmp
-- itself is not shared across invocations), so anything written there
-- (password reset tokens, ID/bank documents, certificates, payroll runs,
-- payout advances) was silently unreliable in production.

CREATE TABLE "KeyValueStore" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KeyValueStore_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "KeyValueStore_key_idx" ON "KeyValueStore"("key");

CREATE TYPE "ComplianceDocKind" AS ENUM ('ID', 'BANK', 'OTHER');
CREATE TYPE "ComplianceDocStatus" AS ENUM ('UPLOADED', 'APPROVED', 'REJECTED');
CREATE TYPE "CertificateStatus" AS ENUM ('PENDING', 'VALID', 'EXPIRED', 'REJECTED');

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ComplianceDocKind" NOT NULL,
    "uploadId" TEXT NOT NULL,
    "status" "ComplianceDocStatus" NOT NULL DEFAULT 'UPLOADED',
    "note" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComplianceDocument_uploadId_key" ON "ComplianceDocument"("uploadId");
CREATE INDEX "ComplianceDocument_userId_kind_idx" ON "ComplianceDocument"("userId", "kind");
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customLabel" TEXT,
    "number" TEXT,
    "issuedOn" TIMESTAMP(3),
    "expiresOn" TIMESTAMP(3),
    "uploadId" TEXT,
    "fileName" TEXT,
    "status" "CertificateStatus" NOT NULL,
    "statusNote" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Certificate_uploadId_key" ON "Certificate"("uploadId");
CREATE INDEX "Certificate_userId_type_idx" ON "Certificate"("userId", "type");
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PayrollRunRecord" (
    "isoWeek" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollRunRecord_pkey" PRIMARY KEY ("isoWeek")
);

CREATE TABLE "PayslipRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayslipRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayslipRecord_userId_isoWeek_key" ON "PayslipRecord"("userId", "isoWeek");
CREATE INDEX "PayslipRecord_userId_idx" ON "PayslipRecord"("userId");

CREATE TABLE "PayoutPreference" (
    "userId" TEXT NOT NULL,
    "speed" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayoutPreference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AdvanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "kind" TEXT,
    "isoWeek" TEXT,
    "timesheetId" TEXT,
    "expectedGrossCents" INTEGER,
    "payoutStatus" TEXT,
    "providerRef" TEXT,
    "note" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "reconciledNetCents" INTEGER,
    CONSTRAINT "AdvanceRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdvanceRecord_userId_status_idx" ON "AdvanceRecord"("userId", "status");
CREATE INDEX "AdvanceRecord_userId_kind_isoWeek_idx" ON "AdvanceRecord"("userId", "kind", "isoWeek");
