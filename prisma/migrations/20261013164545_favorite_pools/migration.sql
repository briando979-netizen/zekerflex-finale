-- CreateEnum
CREATE TYPE "ShiftVisibility" AS ENUM ('PUBLIC', 'POOL_ONLY');

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "visibility" "ShiftVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "FavoritePool" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FavoritePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoritePoolMember" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "freelancerUserId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoritePoolMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftPoolInvite" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftPoolInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoritePool_tenantId_idx" ON "FavoritePool"("tenantId");

-- CreateIndex
CREATE INDEX "FavoritePoolMember_freelancerUserId_idx" ON "FavoritePoolMember"("freelancerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoritePoolMember_poolId_freelancerUserId_key" ON "FavoritePoolMember"("poolId", "freelancerUserId");

-- CreateIndex
CREATE INDEX "ShiftPoolInvite_shiftId_idx" ON "ShiftPoolInvite"("shiftId");

-- CreateIndex
CREATE INDEX "ShiftPoolInvite_poolId_idx" ON "ShiftPoolInvite"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftPoolInvite_shiftId_poolId_key" ON "ShiftPoolInvite"("shiftId", "poolId");

-- AddForeignKey
ALTER TABLE "FavoritePool" ADD CONSTRAINT "FavoritePool_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoritePoolMember" ADD CONSTRAINT "FavoritePoolMember_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "FavoritePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPoolInvite" ADD CONSTRAINT "ShiftPoolInvite_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPoolInvite" ADD CONSTRAINT "ShiftPoolInvite_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "FavoritePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
