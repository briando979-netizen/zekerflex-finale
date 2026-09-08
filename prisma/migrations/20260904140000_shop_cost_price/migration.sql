-- Inkoopprijs (COGS) per webshopproduct — voor margeberekening in /admin/shop.
ALTER TABLE "ShopProduct" ADD COLUMN IF NOT EXISTS "costCents" INTEGER;
