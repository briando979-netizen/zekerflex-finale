-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "RagSourceType" AS ENUM ('CODE', 'AUDIT', 'DATABASE', 'LEGAL', 'SALES', 'INTERACTION');

-- CreateTable
CREATE TABLE "VoiceAnnouncement" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
    "source" TEXT NOT NULL DEFAULT 'system',
    "spokenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagChunk" (
    "id" TEXT NOT NULL,
    "sourceType" "RagSourceType" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "embedDim" INTEGER NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceAnnouncement_spokenAt_createdAt_idx" ON "VoiceAnnouncement"("spokenAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RagChunk_contentHash_key" ON "RagChunk"("contentHash");

-- CreateIndex
CREATE INDEX "RagChunk_sourceType_idx" ON "RagChunk"("sourceType");

-- CreateIndex
CREATE INDEX "RagChunk_sourceRef_idx" ON "RagChunk"("sourceRef");

