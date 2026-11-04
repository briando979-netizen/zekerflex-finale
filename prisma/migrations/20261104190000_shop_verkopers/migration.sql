-- AlterTable
ALTER TABLE "ShopProduct" ADD COLUMN     "sellerNote" TEXT,
ADD COLUMN     "sellerStatus" TEXT,
ADD COLUMN     "sellerTenantId" TEXT;

-- CreateIndex
CREATE INDEX "ShopProduct_sellerTenantId_sellerStatus_idx" ON "ShopProduct"("sellerTenantId", "sellerStatus");

-- AddForeignKey
ALTER TABLE "ShopProduct" ADD CONSTRAINT "ShopProduct_sellerTenantId_fkey" FOREIGN KEY ("sellerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
