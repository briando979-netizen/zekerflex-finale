-- Beoordelingen van echte kopers in de webshop (15 nov 2026, lib/shop/beoordeling.ts). Alleen een nieuwe tabel.

-- CreateTable
CREATE TABLE "ShopReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "sterren" INTEGER NOT NULL,
    "tekst" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'wacht',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopReview_productId_status_idx" ON "ShopReview"("productId", "status");

-- CreateIndex
CREATE INDEX "ShopReview_status_createdAt_idx" ON "ShopReview"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopReview_orderId_productId_key" ON "ShopReview"("orderId", "productId");

-- AddForeignKey
ALTER TABLE "ShopReview" ADD CONSTRAINT "ShopReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopReview" ADD CONSTRAINT "ShopReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
