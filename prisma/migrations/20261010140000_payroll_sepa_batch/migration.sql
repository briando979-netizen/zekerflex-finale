-- CreateTable
CREATE TABLE "PayrollSepaBatch" (
    "id" TEXT NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "debtorIban" TEXT NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "skippedJson" JSONB NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,

    CONSTRAINT "PayrollSepaBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSepaBatch_isoWeek_key" ON "PayrollSepaBatch"("isoWeek");

-- CreateIndex
CREATE INDEX "PayrollSepaBatch_isoWeek_idx" ON "PayrollSepaBatch"("isoWeek");
