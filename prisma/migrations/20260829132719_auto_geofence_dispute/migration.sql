-- CreateEnum
CREATE TYPE "DisputeOrigin" AS ENUM ('MANAGER_REVIEW', 'FREELANCER_SUBMISSION', 'GEOFENCE_VIOLATION', 'MOCK_LOCATION');

-- DropForeignKey
ALTER TABLE "Dispute" DROP CONSTRAINT "Dispute_raisedById_fkey";

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "origin" "DisputeOrigin" NOT NULL DEFAULT 'MANAGER_REVIEW',
ALTER COLUMN "raisedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

