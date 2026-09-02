-- CreateEnum
CREATE TYPE "JarvisTurnStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JarvisEventKind" AS ENUM ('THINKING', 'TOOL_CALL', 'TOOL_RESULT', 'AGENT_DELEGATION', 'MESSAGE', 'ERROR');

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'unknown',
    "model" TEXT NOT NULL,
    "endpointHost" TEXT NOT NULL DEFAULT 'local',
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "throttledMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "jarvisTurnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "prompt" TEXT NOT NULL,
    "status" "JarvisTurnStatus" NOT NULL DEFAULT 'RUNNING',
    "answer" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "JarvisTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisEvent" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "JarvisEventKind" NOT NULL,
    "agent" TEXT NOT NULL DEFAULT 'jarvis',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JarvisEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_purpose_createdAt_idx" ON "AiUsageLog"("purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_storageKey_key" ON "Upload"("storageKey");

-- CreateIndex
CREATE INDEX "Upload_uploadedById_idx" ON "Upload"("uploadedById");

-- CreateIndex
CREATE INDEX "Upload_createdAt_idx" ON "Upload"("createdAt");

-- CreateIndex
CREATE INDEX "JarvisTurn_userId_startedAt_idx" ON "JarvisTurn"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "JarvisTurn_status_idx" ON "JarvisTurn"("status");

-- CreateIndex
CREATE INDEX "JarvisEvent_turnId_idx" ON "JarvisEvent"("turnId");

-- CreateIndex
CREATE UNIQUE INDEX "JarvisEvent_turnId_seq_key" ON "JarvisEvent"("turnId", "seq");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_jarvisTurnId_fkey" FOREIGN KEY ("jarvisTurnId") REFERENCES "JarvisTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarvisEvent" ADD CONSTRAINT "JarvisEvent_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "JarvisTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

