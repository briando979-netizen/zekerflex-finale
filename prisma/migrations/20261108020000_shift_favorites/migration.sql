-- CreateTable ShiftFavorite
CREATE TABLE "ShiftFavorite" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "alertSimilar" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftFavorite_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ShiftFavorite" ADD CONSTRAINT "ShiftFavorite_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftFavorite" ADD CONSTRAINT "ShiftFavorite_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "ShiftFavorite_freelancerId_shiftId_key" ON "ShiftFavorite"("freelancerId", "shiftId");

-- CreateIndex
CREATE INDEX "ShiftFavorite_freelancerId_idx" ON "ShiftFavorite"("freelancerId");

-- CreateIndex
CREATE INDEX "ShiftFavorite_shiftId_idx" ON "ShiftFavorite"("shiftId");
