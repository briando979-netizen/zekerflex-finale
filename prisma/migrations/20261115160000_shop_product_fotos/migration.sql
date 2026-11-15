-- Meerdere foto's per product (15 nov 2026, eigenaar: "ik moet meerdere foto's kunnen uploaden"). De hoofdfoto blijft imageUrl;
-- de extra foto's staan hier, in de volgorde van de shop. Alleen een kolom erbij met een lege standaard: bestaande producten
-- houden hun foto, niets wordt herschreven.
ALTER TABLE "ShopProduct" ADD COLUMN "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[];
