-- Zakelijk bestellen in de webshop: bedrijfsnaam, btw-nummer en eigen referentie
-- op een bestelling. Alleen toevoegen (nullable), bestaande rijen veranderen niet.
ALTER TABLE "ShopOrder" ADD COLUMN "companyName" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "vatNumber" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "reference" TEXT;
