-- Concept: kerst- en speelgoedproducten voor de webshop (zelfde werkwijze als
-- 20261027100000_shop_concept_collections).
--
-- BELANGRIJK: elke rij staat op "active" = false en met voorraad 0. Dit zijn voorbeelden
-- zonder foto, zonder bevestigde prijs, zonder leverancier en zonder bevestigde
-- veiligheidsinformatie (speelgoed). Ze staan NIET in de winkel en niemand kan ze bestellen.
-- De eigenaar controleert in Beheer -> Webshop naam, prijs, voorraad en foto en zet ze zelf aan.
-- De prijzen zijn een indicatie, geen afspraak met een leverancier.
--
-- Idempotent: ON CONFLICT DO NOTHING op product-id en sku.

INSERT INTO "ShopProduct"
  ("id","name","slug","description","category","gender","collection","isBundle","priceCents","stock","active","sortOrder","createdAt","updatedAt")
VALUES
  ('cncpt_kerstballen_set','Kerstballen set','kerstballen-set','Set kerstballen in een doos, om op te hangen in de kerstboom. Kleur en aantal per set controleert de eigenaar voordat dit product live gaat.','Kerst',NULL,'Kerst 2026',false,795,0,false,301,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_kerstmuts','Kerstmuts','kerstmuts','Rode kerstmuts met witte rand, voor op het werk, thuis of op het kerstdiner.','Kerst',NULL,'Kerst 2026',false,495,0,false,302,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_kerstsokken','Kerstsokken','kerstsokken','Warme sokken met een kerstmotief. Per paar.','Kerst',NULL,'Kerst 2026',false,695,0,false,303,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_adventskalender_zelf_vullen','Adventskalender om zelf te vullen','adventskalender-zelf-vullen','Kalender met 24 vakjes die je zelf vult met wat jij wilt. De inhoud zit er niet bij.','Kerst',NULL,'Kerst 2026',false,1495,0,false,304,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_cadeaupapier_kerst','Cadeaupapier kerst','cadeaupapier-kerst','Rollen cadeaupapier met een kerstprint, om zelf cadeaus mee in te pakken.','Kerst',NULL,'Kerst 2026',false,595,0,false,305,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_kerstkaarten_set','Kerstkaarten set','kerstkaarten-set','Set kerstkaarten met enveloppen, om zelf te schrijven en te versturen.','Kerst',NULL,'Kerst 2026',false,695,0,false,306,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_houten_blokkenset','Houten blokkenset','houten-blokkenset','Set houten blokken in verschillende vormen en kleuren om mee te bouwen. Leeftijdsadvies en veiligheidsinformatie vult de eigenaar aan zodra die van de leverancier bekend is.','Speelgoed',NULL,'Speelgoed',false,2495,0,false,307,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_puzzel_100_stukjes','Puzzel 100 stukjes','puzzel-100-stukjes','Legpuzzel van 100 stukjes in een doos, om samen of alleen te leggen.','Speelgoed',NULL,'Speelgoed',false,1295,0,false,308,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_knuffelbeer','Knuffelbeer','knuffelbeer','Zachte knuffelbeer om mee te spelen of cadeau te doen. Leeftijdsadvies vult de eigenaar aan zodra dat bekend is.','Speelgoed',NULL,'Speelgoed',false,1695,0,false,309,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_kleurboek_met_potloden','Kleurboek met potloden','kleurboek-met-potloden','Kleurboek met een set kleurpotloden, om te tekenen en te kleuren.','Speelgoed',NULL,'Speelgoed',false,1095,0,false,310,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_geheugenspel','Geheugenspel','geheugenspel','Kaartspel waarbij je twee dezelfde plaatjes zoekt. Voor twee of meer spelers.','Speelgoed',NULL,'Speelgoed',false,1195,0,false,311,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('cncpt_houten_trein','Houten trein','houten-trein','Houten speelgoedtrein met losse wagons, om over de vloer te rijden. Leeftijdsadvies vult de eigenaar aan zodra dat bekend is.','Speelgoed',NULL,'Speelgoed',false,2995,0,false,312,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Een standaardvariant per product (zonder maat of kleur), voorraad 0.
INSERT INTO "ShopProductVariant" ("id","productId","size","color","priceCents","stock","sku","createdAt","updatedAt")
SELECT 'cvar_' || md5(id), id, NULL, NULL, NULL, 0, slug, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ShopProduct"
WHERE collection IN ('Kerst 2026', 'Speelgoed') AND id LIKE 'cncpt\_%'
ON CONFLICT ("sku") DO NOTHING;
