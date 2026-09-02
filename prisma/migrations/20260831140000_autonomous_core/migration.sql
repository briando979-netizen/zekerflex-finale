-- CreateEnum
CREATE TYPE "EngagementKind" AS ENUM ('APP_OPEN', 'OFFER_VIEWED', 'OFFER_RESPONDED', 'CHECK_IN', 'TIMESHEET_SUBMITTED');

-- CreateEnum
CREATE TYPE "SalesLeadStatus" AS ENUM ('NEW', 'ENRICHED', 'DRAFTED', 'APPROVED', 'SENT', 'REPLIED', 'WON', 'LOST', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "SalesOutreachStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'DISCARDED');

-- CreateEnum
CREATE TYPE "OrchestrationTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateEnum
CREATE TYPE "OrchestrationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingActionKind" AS ENUM ('NONE', 'CONSOLE_QUERY', 'CONSOLE_MUTATION', 'CODE_PATCH', 'MANUAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ACTIONED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditCategory" ADD VALUE 'SALES';
ALTER TYPE "AuditCategory" ADD VALUE 'ORCHESTRATION';

-- AlterTable
ALTER TABLE "FreelancerProfile" ADD COLUMN     "activeHoursComputedAt" TIMESTAMP(3),
ADD COLUMN     "learnedActiveHours" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "EngagementEvent" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "kind" "EngagementKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLead" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "kvkNumber" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "city" TEXT,
    "sector" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" "SalesLeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "scoreRationale" TEXT,
    "notes" TEXT,
    "enrichmentJson" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOutreach" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" "SalesOutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "generatedByModel" TEXT,
    "editedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestrationRun" (
    "id" TEXT NOT NULL,
    "trigger" "OrchestrationTrigger" NOT NULL,
    "status" "OrchestrationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "snapshotJson" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "error" TEXT,

    CONSTRAINT "OrchestrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestrationFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "actionKind" "FindingActionKind" NOT NULL DEFAULT 'NONE',
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "actionPayload" JSONB NOT NULL DEFAULT '{}',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestrationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngagementEvent_freelancerId_occurredAt_idx" ON "EngagementEvent"("freelancerId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesLead_status_createdAt_idx" ON "SalesLead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SalesLead_kvkNumber_idx" ON "SalesLead"("kvkNumber");

-- CreateIndex
CREATE INDEX "SalesOutreach_leadId_status_idx" ON "SalesOutreach"("leadId", "status");

-- CreateIndex
CREATE INDEX "OrchestrationRun_status_startedAt_idx" ON "OrchestrationRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "OrchestrationFinding_runId_idx" ON "OrchestrationFinding"("runId");

-- CreateIndex
CREATE INDEX "OrchestrationFinding_status_severity_idx" ON "OrchestrationFinding"("status", "severity");

-- AddForeignKey
ALTER TABLE "EngagementEvent" ADD CONSTRAINT "EngagementEvent_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOutreach" ADD CONSTRAINT "SalesOutreach_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SalesLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrchestrationFinding" ADD CONSTRAINT "OrchestrationFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "OrchestrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

