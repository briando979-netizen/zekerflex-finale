-- Real sizes for the clothing / shoes / gloves that so far had a single
-- size-less variant, and four work-type bundles (as concept: active = false,
-- for the owner to check price and contents before they go live).
--
-- Safe to run on any database:
--   * products are matched by slug; missing slugs are simply skipped
--   * a product only gets sizes if it still has no sized variant
--   * the old size-less variant is kept (order history / open carts) but set
--     to stock 0, so customers pick a size from now on
--   * bundles are only created if their slug doesn't exist yet, and only from
--     size-less products (a bundle is sold as one line, without a size choice)

CREATE TEMP TABLE _zf_sizes (slug TEXT, sizes TEXT[]) ON COMMIT DROP;
INSERT INTO _zf_sizes VALUES
  ('veiligheidsschoenen-s3',      ARRAY['38','39','40','41','42','43','44','45','46','47']),
  ('veiligheidssneakers-s1p',     ARRAY['38','39','40','41','42','43','44','45','46','47']),
  ('antislip-werkschoenen-ob',    ARRAY['36','37','38','39','40','41','42','43','44','45','46','47']),
  ('werkhandschoenen-grip',       ARRAY['S','M','L','XL']),
  ('snijbestendige-handschoenen', ARRAY['S','M','L','XL']),
  ('werkbroek-kniezakken',        ARRAY['44','46','48','50','52','54','56']),
  ('softshell-werkjas',           ARRAY['S','M','L','XL','XXL']),
  ('werk-tshirt-2pack',           ARRAY['S','M','L','XL','XXL']),
  ('everyday-hoodie',             ARRAY['S','M','L','XL','XXL']),
  ('field-overshirt',             ARRAY['S','M','L','XL','XXL']),
  ('shift-socks-2-pack',          ARRAY['39-42','43-46']);

-- one variant per size, stock spread evenly (at least 2 each)
INSERT INTO "ShopProductVariant" ("id", "productId", "size", "color", "priceCents", "stock", "sku", "createdAt", "updatedAt")
SELECT
  'var_' || md5(p."id" || ':' || s.size),
  p."id",
  s.size,
  NULL,
  NULL,
  GREATEST(2, p."stock" / array_length(z.sizes, 1)),
  p."slug" || '-' || lower(replace(s.size, '/', '-')),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _zf_sizes z
JOIN "ShopProduct" p ON p."slug" = z.slug
CROSS JOIN LATERAL unnest(z.sizes) AS s(size)
WHERE NOT EXISTS (SELECT 1 FROM "ShopProductVariant" v WHERE v."productId" = p."id" AND v."size" IS NOT NULL)
ON CONFLICT ("sku") DO NOTHING;

-- the old size-less variant of those products is no longer sold
UPDATE "ShopProductVariant" v
SET "stock" = 0, "updatedAt" = CURRENT_TIMESTAMP
FROM "ShopProduct" p
JOIN _zf_sizes z ON z.slug = p."slug"
WHERE v."productId" = p."id"
  AND v."size" IS NULL
  AND EXISTS (SELECT 1 FROM "ShopProductVariant" s WHERE s."productId" = p."id" AND s."size" IS NOT NULL);

-- bundles per type of work (concept)
CREATE TEMP TABLE _zf_bundles (slug TEXT, name TEXT, description TEXT, price INT, items TEXT[]) ON COMMIT DROP;
INSERT INTO _zf_bundles VALUES
  ('bundel-bouwplaats', 'Bouwplaats-set (helm, bril, oordoppen, VCA-boek)',
   'Alles wat je op de eerste dag op een bouwplaats nodig hebt, behalve schoenen: veiligheidshelm, veiligheidsbril, gehoorbescherming en het VCA-lesboek. Voordeliger dan los.',
   4995, ARRAY['veiligheidshelm','veiligheidsbril-helder','gehoorbescherming-oordoppen','vca-basis-boek']),
  ('bundel-magazijn', 'Magazijn-basisset (hesje, oordoppen, VCA-boek)',
   'Voor je eerste magazijn- of logistiekklus: reflecterend hesje, gehoorbescherming en het VCA-lesboek. Veiligheidsschoenen kies je los in jouw maat.',
   3495, ARRAY['veiligheidshesje','gehoorbescherming-oordoppen','vca-basis-boek']),
  ('bundel-evenement', 'Evenement-crewset (hesje + oordoppen)',
   'Herkenbaar als crew en beschermd tegen harde muziek: reflecterend hesje en gehoorbescherming.',
   1295, ARRAY['veiligheidshesje','gehoorbescherming-oordoppen']),
  ('bundel-schoonmaak', 'Schoonmaak-set (kniebeschermers + bril)',
   'Voor vloeren, sanitair en laag werk: kniebeschermers en een veiligheidsbril tegen spatten van schoonmaakmiddel.',
   2395, ARRAY['kniebeschermers','veiligheidsbril-helder']);

INSERT INTO "ShopProduct" ("id", "name", "slug", "description", "category", "isBundle", "priceCents", "stock", "imageUrl", "badge", "active", "sortOrder", "createdAt", "updatedAt")
SELECT
  'prod_' || md5(b.slug),
  b.name,
  b.slug,
  b.description,
  'Werk & PBM',
  true,
  b.price,
  25,
  (SELECT p."imageUrl" FROM "ShopProduct" p WHERE p."slug" = b.items[1]),
  'Set',
  false,
  5,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _zf_bundles b
WHERE NOT EXISTS (SELECT 1 FROM "ShopProduct" p WHERE p."slug" = b.slug)
  -- only if every item exists on this database
  AND (SELECT count(*) FROM "ShopProduct" p WHERE p."slug" = ANY (b.items)) = array_length(b.items, 1);

INSERT INTO "ShopBundleItem" ("id", "bundleProductId", "itemProductId", "qty")
SELECT 'bi_' || md5(bp."id" || ':' || ip."id"), bp."id", ip."id", 1
FROM _zf_bundles b
JOIN "ShopProduct" bp ON bp."slug" = b.slug
CROSS JOIN LATERAL unnest(b.items) AS it(slug)
JOIN "ShopProduct" ip ON ip."slug" = it.slug
ON CONFLICT ("bundleProductId", "itemProductId") DO NOTHING;

-- every bundle needs its one purchasable (size-less) variant
INSERT INTO "ShopProductVariant" ("id", "productId", "size", "color", "priceCents", "stock", "sku", "createdAt", "updatedAt")
SELECT 'var_' || md5(p."id"), p."id", NULL, NULL, NULL, p."stock", p."slug" || '-one', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ShopProduct" p
WHERE p."isBundle" AND NOT EXISTS (SELECT 1 FROM "ShopProductVariant" v WHERE v."productId" = p."id")
ON CONFLICT ("sku") DO NOTHING;
