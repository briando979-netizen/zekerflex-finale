-- AddColumn: createdByUserId to Shift
ALTER TABLE "Shift" ADD COLUMN "createdByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddIndex
CREATE INDEX "Shift_createdByUserId_idx" ON "Shift"("createdByUserId");
