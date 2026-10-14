-- CreateEnum
CREATE TYPE "BranchKind" AS ENUM ('PERMANENT', 'AD_HOC');

-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'UITZEND_FEE';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "kind" "BranchKind" NOT NULL DEFAULT 'PERMANENT';
