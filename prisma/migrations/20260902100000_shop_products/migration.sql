CREATE TABLE "ShopProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "imageUploadId" TEXT,
    "modelUploadId" TEXT,
    "imageUrl" TEXT,
    "modelPhotoUrl" TEXT,
    "badge" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopProduct_slug_key" ON "ShopProduct"("slug");
CREATE INDEX "ShopProduct_active_sortOrder_idx" ON "ShopProduct"("active", "sortOrder");
CREATE INDEX "ShopProduct_category_active_idx" ON "ShopProduct"("category", "active");