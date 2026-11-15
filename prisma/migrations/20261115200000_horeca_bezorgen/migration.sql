-- Afhalen en bezorgen in de horeca (15 nov 2026, lib/horeca/bezorgen.ts). Alleen kolommen erbij met een standaard of
-- leeg (null): bestaande bestellingen worden "tafel", niets wordt herschreven. Plus een index voor het archief per soort.

-- AlterTable
ALTER TABLE "HorecaZaak" ADD COLUMN     "bezorgen" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "HorecaBestelling" ADD COLUMN     "adres" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "afgeleverdOp" TIMESTAMP(3),
ADD COLUMN     "afstandM" INTEGER,
ADD COLUMN     "betaalwijze" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bevestigdOp" TIMESTAMP(3),
ADD COLUMN     "bezorgerId" TEXT,
ADD COLUMN     "bezorgkostenCent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gewenstOp" TIMESTAMP(3),
ADD COLUMN     "kortingCent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "onderwegOp" TIMESTAMP(3),
ADD COLUMN     "plaats" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "postcode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "soort" TEXT NOT NULL DEFAULT 'tafel',
ADD COLUMN     "telefoon" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "HorecaBestelling_zaakId_soort_createdAt_idx" ON "HorecaBestelling"("zaakId", "soort", "createdAt");

