-- Every shop product needs at least one variant row: the cart and the order
-- pipeline price and stock against ShopProductVariant. Products seeded by
-- earlier migrations had none on a fresh database (unbuyable: "Kies een optie"
-- with nothing to choose). Same convention as POST /api/shop/products: one
-- variant without size/colour, inheriting the product price, with the
-- product's stock. Idempotent — products that already have variants are untouched.
INSERT INTO "ShopProductVariant" ("id", "productId", "size", "color", "priceCents", "stock", "sku", "createdAt", "updatedAt")
SELECT 'var_' || md5(p."id"), p."id", NULL, NULL, NULL, p."stock", p."slug" || '-one', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ShopProduct" p
WHERE NOT EXISTS (SELECT 1 FROM "ShopProductVariant" v WHERE v."productId" = p."id")
ON CONFLICT ("sku") DO NOTHING;
