-- Aanbiedingen in de webshop (lib/shop/aanbieding.ts): een "van"-prijs mag alleen de laagste prijs van de laatste
-- 30 dagen zijn. Daarom houdt de database zelf elke prijswijziging bij (ShopPriceLog, via triggers), zodat geen enkele
-- weg die een prijs wijzigt (beheer, leverancier, verkoper, script) de historie kan overslaan.
-- Alleen toevoegen: bestaande rijen en prijzen veranderen niet.
-- Terugdraaien: DROP TRIGGER "ShopProduct_prijs_log" ON "ShopProduct"; DROP TRIGGER "ShopProductVariant_prijs_log" ON
-- "ShopProductVariant"; DROP FUNCTION shop_prijs_log_product(); DROP FUNCTION shop_prijs_log_variant();
-- DROP TABLE "ShopPriceLog"; en de vijf deal-kolommen weghalen.

ALTER TABLE "ShopProduct" ADD COLUMN "dealVanCents" INTEGER,
ADD COLUMN "dealNormaalCents" INTEGER,
ADD COLUMN "dealEindigt" TIMESTAMP(3);

ALTER TABLE "ShopProductVariant" ADD COLUMN "dealVanCents" INTEGER,
ADD COLUMN "dealNormaalCents" INTEGER;

CREATE TABLE "ShopPriceLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "priceCents" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopPriceLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShopPriceLog_productId_variantId_at_idx" ON "ShopPriceLog"("productId", "variantId", "at");

CREATE INDEX "ShopProduct_dealEindigt_idx" ON "ShopProduct"("dealEindigt");

ALTER TABLE "ShopPriceLog" ADD CONSTRAINT "ShopPriceLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- de beginstand: de prijs van nu. Een product dat sinds het aanmaken nooit is gewijzigd, heeft die prijs zeker al sinds
-- het aanmaken: daar begint zijn historie dan ook. Van elk ander product weten we de prijs pas zeker vanaf vandaag; daar
-- kan dus pas over 30 dagen een aanbieding op (lib/shop/aanbieding.ts, historieDekt).
INSERT INTO "ShopPriceLog" ("id", "productId", "variantId", "priceCents", "at")
SELECT gen_random_uuid()::text, p."id", NULL, p."priceCents",
       CASE WHEN p."updatedAt" <= p."createdAt" + INTERVAL '1 minute' THEN p."createdAt" ELSE CURRENT_TIMESTAMP END
FROM "ShopProduct" p;

INSERT INTO "ShopPriceLog" ("id", "productId", "variantId", "priceCents", "at")
SELECT gen_random_uuid()::text, v."productId", v."id", v."priceCents", CURRENT_TIMESTAMP FROM "ShopProductVariant" v WHERE v."priceCents" IS NOT NULL;

CREATE FUNCTION shop_prijs_log_product() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."priceCents" IS DISTINCT FROM OLD."priceCents" THEN
    BEGIN
      INSERT INTO "ShopPriceLog" ("id", "productId", "variantId", "priceCents", "at")
      VALUES (gen_random_uuid()::text, NEW."id", NULL, NEW."priceCents", CURRENT_TIMESTAMP);
    EXCEPTION WHEN OTHERS THEN
      -- de prijswijziging zelf gaat altijd door; alleen de historie mist dan een regel
      RAISE WARNING 'shop prijslog mislukt: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ShopProduct_prijs_log"
AFTER INSERT OR UPDATE OF "priceCents" ON "ShopProduct"
FOR EACH ROW EXECUTE FUNCTION shop_prijs_log_product();

CREATE FUNCTION shop_prijs_log_variant() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."priceCents" IS NOT NULL AND (TG_OP = 'INSERT' OR NEW."priceCents" IS DISTINCT FROM OLD."priceCents") THEN
    BEGIN
      INSERT INTO "ShopPriceLog" ("id", "productId", "variantId", "priceCents", "at")
      VALUES (gen_random_uuid()::text, NEW."productId", NEW."id", NEW."priceCents", CURRENT_TIMESTAMP);
    EXCEPTION WHEN OTHERS THEN
      -- de prijswijziging zelf gaat altijd door; alleen de historie mist dan een regel
      RAISE WARNING 'shop prijslog mislukt: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ShopProductVariant_prijs_log"
AFTER INSERT OR UPDATE OF "priceCents" ON "ShopProductVariant"
FOR EACH ROW EXECUTE FUNCTION shop_prijs_log_variant();
