-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripeSessionId" TEXT,
ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "trackingNumber" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_stripeSessionId_key" ON "ShopOrder"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_stripePaymentIntentId_key" ON "ShopOrder"("stripePaymentIntentId");
