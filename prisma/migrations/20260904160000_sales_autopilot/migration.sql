-- Sales-recruiter motor: campagnes, discovery-bronnen, onderdrukkingslijst,
-- engine-runs + sequence-velden op SalesLead / SalesOutreach.

-- CreateEnum
CREATE TYPE "SalesSendMode" AS ENUM ('REVIEW', 'AUTOPILOT');

-- CreateEnum
CREATE TYPE "SalesCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'DONE');

-- CreateEnum
CREATE TYPE "SalesSourceKind" AS ENUM ('KVKBASE', 'CAREERS_URL', 'CSV');

-- AlterEnum: SalesLeadStatus gains QUEUED / BOUNCED / UNSUBSCRIBED
ALTER TYPE "SalesLeadStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "SalesLeadStatus" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "SalesLeadStatus" ADD VALUE IF NOT EXISTS 'UNSUBSCRIBED';

-- AlterEnum: SalesOutreachStatus gains SCHEDULED / FAILED / SUPPRESSED
ALTER TYPE "SalesOutreachStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "SalesOutreachStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "SalesOutreachStatus" ADD VALUE IF NOT EXISTS 'SUPPRESSED';

-- CreateTable
CREATE TABLE "SalesCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SalesCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "SalesSendMode" NOT NULL DEFAULT 'REVIEW',
    "dailyCap" INTEGER NOT NULL DEFAULT 40,
    "sendStartHour" INTEGER NOT NULL DEFAULT 8,
    "sendEndHour" INTEGER NOT NULL DEFAULT 18,
    "workdaysOnly" BOOLEAN NOT NULL DEFAULT true,
    "minScore" INTEGER NOT NULL DEFAULT 55,
    "stepDelaysDays" INTEGER[] DEFAULT ARRAY[0, 4, 10]::INTEGER[],
    "targetSectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fromAddress" TEXT,
    "autopilotConfirmedAt" TIMESTAMP(3),
    "autopilotConfirmedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDiscoverySource" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "kind" "SalesSourceKind" NOT NULL,
    "url" TEXT,
    "label" TEXT,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastResultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDiscoverySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesSuppression" (
    "email" TEXT NOT NULL,
    "domain" TEXT,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesSuppression_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "SalesEngineRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "enriched" INTEGER NOT NULL DEFAULT 0,
    "scored" INTEGER NOT NULL DEFAULT 0,
    "drafted" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,

    CONSTRAINT "SalesEngineRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SalesLead"
    ADD COLUMN "campaignId" TEXT,
    ADD COLUMN "sourceUrl" TEXT,
    ADD COLUMN "vacancySignal" TEXT,
    ADD COLUMN "discoveredEmail" TEXT,
    ADD COLUMN "sequenceStep" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "nextActionAt" TIMESTAMP(3),
    ADD COLUMN "suppressed" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "suppressedReason" TEXT,
    ADD COLUMN "repliedAt" TIMESTAMP(3),
    ADD COLUMN "bouncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SalesOutreach"
    ADD COLUMN "stepIndex" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "scheduledAt" TIMESTAMP(3),
    ADD COLUMN "sentVia" TEXT,
    ADD COLUMN "mailId" TEXT,
    ADD COLUMN "failReason" TEXT;

-- CreateIndex
CREATE INDEX "SalesCampaign_status_idx" ON "SalesCampaign"("status");

-- CreateIndex
CREATE INDEX "SalesDiscoverySource_campaignId_idx" ON "SalesDiscoverySource"("campaignId");

-- CreateIndex
CREATE INDEX "SalesSuppression_domain_idx" ON "SalesSuppression"("domain");

-- CreateIndex
CREATE INDEX "SalesEngineRun_startedAt_idx" ON "SalesEngineRun"("startedAt");

-- CreateIndex
CREATE INDEX "SalesLead_campaignId_nextActionAt_idx" ON "SalesLead"("campaignId", "nextActionAt");

-- AddForeignKey
ALTER TABLE "SalesDiscoverySource" ADD CONSTRAINT "SalesDiscoverySource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLead" ADD CONSTRAINT "SalesLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
