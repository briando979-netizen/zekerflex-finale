-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'DOMEIN';

-- AlterEnum
ALTER TYPE "DomeinBestelStatus" ADD VALUE 'OPGEZEGD';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "domeinBestellingId" TEXT;

-- AlterTable
ALTER TABLE "DomeinBestelling" ADD COLUMN     "autoVerlengen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "opgezegdOp" TIMESTAMP(3),
ADD COLUMN     "verlooptOp" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Invoice_domeinBestellingId_idx" ON "Invoice"("domeinBestellingId");

-- CreateIndex
CREATE INDEX "DomeinBestelling_status_verlooptOp_idx" ON "DomeinBestelling"("status", "verlooptOp");

