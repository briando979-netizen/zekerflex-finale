-- AlterTable
ALTER TABLE "ShopProduct" ADD COLUMN     "collection" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "isBundle" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShopProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "priceCents" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopBundleItem" (
    "id" TEXT NOT NULL,
    "bundleProductId" TEXT NOT NULL,
    "itemProductId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ShopBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopProductVariant_sku_key" ON "ShopProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ShopProductVariant_productId_idx" ON "ShopProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopBundleItem_bundleProductId_itemProductId_key" ON "ShopBundleItem"("bundleProductId", "itemProductId");

-- CreateIndex
CREATE INDEX "ShopProduct_gender_collection_idx" ON "ShopProduct"("gender", "collection");

-- AddForeignKey
ALTER TABLE "ShopProductVariant" ADD CONSTRAINT "ShopProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopBundleItem" ADD CONSTRAINT "ShopBundleItem_bundleProductId_fkey" FOREIGN KEY ("bundleProductId") REFERENCES "ShopProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopBundleItem" ADD CONSTRAINT "ShopBundleItem_itemProductId_fkey" FOREIGN KEY ("itemProductId") REFERENCES "ShopProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
