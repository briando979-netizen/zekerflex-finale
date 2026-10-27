-- Concept product lines for the shop (plan: kind-finding-cherny, Fase 2).
-- A realistic clothing catalog across two new collections (Winter 2026 and
-- Zakelijk) and three genders (heren/vrouwen/kinderen), so the owner has a
-- filled catalog to review in /admin/shop and the gender/size/colour facet
-- filters have real data to work with.
--
-- IMPORTANT: every row is inserted with "active" = false. These are concepts:
-- they do NOT appear in the public storefront and nobody can check out against
-- them until the owner reviews name/price/photo and flips them active in admin.
-- "imageUrl" is left NULL on purpose — the owner uploads a real photo per item
-- rather than us wiring a generic stock image that misrepresents the product.
--
-- Idempotent: ON CONFLICT DO NOTHING on both the product id and the variant sku,
-- so re-running (or a partial earlier run) never duplicates or errors.

-- 1) The concept products -----------------------------------------------------
INSERT INTO "ShopProduct"
  ("id","name","slug","description","category","gender","collection","isBundle","priceCents","costCents","stock","active","sortOrder","createdAt","updatedAt")
VALUES
  ('cncpt_trui_h','Gebreide Winter Trui','winter-trui-heren','Zacht gebreide trui met ronde hals. Warm en comfortabel voor koude werkdagen.','Kleding','heren','Winter 2026',false,4995,2600,40,false,201,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_bodywarmer_h','Gevoerde Bodywarmer','winter-bodywarmer-heren','Lichtgewicht gevoerde bodywarmer die warmte vasthoudt zonder te beperken.','Kleding','heren','Winter 2026',false,5995,3100,40,false,202,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_vest_d','Dames Winter Vest','winter-vest-dames','Elegant gebreid vest met knoopsluiting, ideaal als extra laag.','Kleding','vrouwen','Winter 2026',false,4495,2300,40,false,203,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_coltrui_d','Warme Coltrui','winter-coltrui-dames','Warme coltrui van zachte stof met een soepele pasvorm.','Kleding','vrouwen','Winter 2026',false,3995,2000,40,false,204,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_jas_k','Kids Winterjas','winter-jas-kids','Waterafstotende winterjas voor kinderen met gevoerde capuchon.','Kleding','kinderen','Winter 2026',false,5495,2800,40,false,205,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_trui_k','Kids Gebreide Trui','winter-trui-kids','Stevige gebreide trui voor kinderen, machinewasbaar.','Kleding','kinderen','Winter 2026',false,2995,1500,40,false,206,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_pant_h','Heren Pantalon Slim Fit','zakelijk-pantalon-heren','Nette slim-fit pantalon met stretch voor de hele dag comfort.','Kleding','heren','Zakelijk',false,6495,3300,40,false,207,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_overhemd_h','Oxford Overhemd','zakelijk-overhemd-heren','Klassiek oxford overhemd, strijkvriendelijk en veelzijdig.','Kleding','heren','Zakelijk',false,4995,2500,40,false,208,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_colbert_h','Zakelijk Colbert','zakelijk-colbert-heren','Getailleerd colbert voor een verzorgde zakelijke uitstraling.','Kleding','heren','Zakelijk',false,11995,6200,40,false,209,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_blazer_d','Dames Blazer','zakelijk-blazer-dames','Strak getailleerde blazer die elke outfit afmaakt.','Kleding','vrouwen','Zakelijk',false,10995,5700,40,false,210,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_pant_d','Zakelijke Pantalon Dames','zakelijk-pantalon-dames','Zakelijke pantalon met hoge taille en vloeiende pijpen.','Kleding','vrouwen','Zakelijk',false,5995,3000,40,false,211,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_blouse_d','Zijden Blouse','zakelijk-blouse-dames','Zijdeachtige blouse met subtiele glans, prettig op de huid.','Kleding','vrouwen','Zakelijk',false,5495,2800,40,false,212,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 2) Size-only variants (price inherited: priceCents NULL) ---------------------
-- S–XXL group
INSERT INTO "ShopProductVariant" ("id","productId","size","color","priceCents","stock","sku","createdAt","updatedAt")
SELECT 'cvar_' || md5(p.pid || '|' || s.sz), p.pid, s.sz, NULL, NULL, 20, p.slug || '-' || lower(s.sz), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('cncpt_bodywarmer_h','winter-bodywarmer-heren'),
  ('cncpt_overhemd_h','zakelijk-overhemd-heren')
) AS p(pid, slug)
CROSS JOIN (VALUES ('S'),('M'),('L'),('XL'),('XXL')) AS s(sz)
ON CONFLICT ("sku") DO NOTHING;

-- XS–XL group
INSERT INTO "ShopProductVariant" ("id","productId","size","color","priceCents","stock","sku","createdAt","updatedAt")
SELECT 'cvar_' || md5(p.pid || '|' || s.sz), p.pid, s.sz, NULL, NULL, 20, p.slug || '-' || lower(s.sz), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('cncpt_vest_d','winter-vest-dames'),
  ('cncpt_coltrui_d','winter-coltrui-dames'),
  ('cncpt_blouse_d','zakelijk-blouse-dames')
) AS p(pid, slug)
CROSS JOIN (VALUES ('XS'),('S'),('M'),('L'),('XL')) AS s(sz)
ON CONFLICT ("sku") DO NOTHING;

-- Kids sizes 116–164
INSERT INTO "ShopProductVariant" ("id","productId","size","color","priceCents","stock","sku","createdAt","updatedAt")
SELECT 'cvar_' || md5(p.pid || '|' || s.sz), p.pid, s.sz, NULL, NULL, 20, p.slug || '-' || s.sz, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('cncpt_jas_k','winter-jas-kids'),
  ('cncpt_trui_k','winter-trui-kids')
) AS p(pid, slug)
CROSS JOIN (VALUES ('116'),('128'),('140'),('152'),('164')) AS s(sz)
ON CONFLICT ("sku") DO NOTHING;

-- Heren confectiematen 46–56
INSERT INTO "ShopProductVariant" ("id","productId","size","color","priceCents","stock","sku","createdAt","updatedAt")
SELECT 'cvar_' || md5(p.pid || '|' || s.sz), p.pid, s.sz, NULL, NULL, 20, p.slug || '-' || s.sz, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('cncpt_pant_h','zakelijk-pantalon-heren'),
  ('cncpt_colbert_h','zakelijk-colbert-heren')
) AS p(pid, slug)
CROSS JOIN (VALUES ('46'),('48'),('50'),('52'),('54'),('56')) AS s(sz)
ON CONFLICT ("sku") DO NOTHING;

-- Dames confectiematen 34–44
INSERT INTO "ShopProductVariant" ("id","productId","size","color","priceCents","stock","sku","createdAt","updatedAt")
SELECT 'cvar_' || md5('cncpt_pant_d' || '|' || s.sz), 'cncpt_pant_d', s.sz, NULL, NULL, 20, 'zakelijk-pantalon-dames-' || s.sz, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('34'),('36'),('38'),('40'),('42'),('44')) AS s(sz)
ON CONFLICT ("sku") DO NOTHING;

-- 3) Size x colour variants (showcase the colour facet) -----------------------
-- Gebreide Winter Trui: Antraciet + Navy, S–XXL
INSERT INTO "ShopProductVariant" ("id","productId","size","color","priceCents","stock","sku","createdAt","updatedAt")
SELECT 'cvar_' || md5('cncpt_trui_h' || '|' || s.sz || '|' || c.col), 'cncpt_trui_h', s.sz, c.col, NULL, 20,
       'winter-trui-heren-' || lower(s.sz) || '-' || lower(c.col), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('S'),('M'),('L'),('XL'),('XXL')) AS s(sz)
CROSS JOIN (VALUES ('Antraciet'),('Navy')) AS c(col)
ON CONFLICT ("sku") DO NOTHING;

-- Dames Blazer: Zwart + Marineblauw, XS–XL
INSERT INTO "ShopProductVariant" ("id","productId","size","color","priceCents","stock","sku","createdAt","updatedAt")
SELECT 'cvar_' || md5('cncpt_blazer_d' || '|' || s.sz || '|' || c.col), 'cncpt_blazer_d', s.sz, c.col, NULL, 20,
       'zakelijk-blazer-dames-' || lower(s.sz) || '-' || lower(c.col), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('XS'),('S'),('M'),('L'),('XL')) AS s(sz)
CROSS JOIN (VALUES ('Zwart'),('Marineblauw')) AS c(col)
ON CONFLICT ("sku") DO NOTHING;
