-- Recht om te werken per land (lib/werkrecht): verklaring + bewijs per werker en land.
-- Alleen een nieuwe tabel; bestaande tabellen en rijen veranderen niet.
-- CreateTable
CREATE TABLE "WorkRight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3),
    "declaration" TEXT,
    "uploadId" TEXT,
    "status" "ComplianceDocStatus",
    "validUntil" TIMESTAMP(3),
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkRight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkRight_uploadId_key" ON "WorkRight"("uploadId");

-- CreateIndex
CREATE INDEX "WorkRight_status_idx" ON "WorkRight"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkRight_userId_country_key" ON "WorkRight"("userId", "country");

-- AddForeignKey
ALTER TABLE "WorkRight" ADD CONSTRAINT "WorkRight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRight" ADD CONSTRAINT "WorkRight_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
