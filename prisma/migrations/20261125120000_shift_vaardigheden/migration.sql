-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "vaardigheden" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
