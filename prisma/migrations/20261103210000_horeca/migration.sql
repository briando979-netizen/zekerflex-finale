-- Horeca-pakket (lib/horeca): alleen nieuwe typen, tabellen, indexen en koppelingen.
-- Raakt geen bestaande tabel; de Tenant-backrelatie bestaat alleen in Prisma.

-- CreateEnum
CREATE TYPE "HorecaBestellingStatus" AS ENUM ('NIEUW', 'IN_BEREIDING', 'KLAAR', 'GESERVEERD', 'GEANNULEERD');

-- CreateEnum
CREATE TYPE "HorecaReserveringStatus" AS ENUM ('BEVESTIGD', 'AANGEKOMEN', 'NIET_GEKOMEN', 'GEANNULEERD');

-- CreateEnum
CREATE TYPE "HorecaBetalingStatus" AS ENUM ('OPEN', 'BETAALD', 'MISLUKT');

-- CreateTable
CREATE TABLE "HorecaZaak" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "soort" TEXT NOT NULL DEFAULT 'restaurant',
    "plaats" TEXT NOT NULL DEFAULT '',
    "adres" TEXT NOT NULL DEFAULT '',
    "telefoon" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "kvk" TEXT NOT NULL DEFAULT '',
    "kleur" TEXT NOT NULL DEFAULT '#0A120E',
    "accent" TEXT NOT NULL DEFAULT '#FF5F1F',
    "online" BOOLEAN NOT NULL DEFAULT false,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openingstijden" JSONB NOT NULL DEFAULT '{}',
    "reserveren" JSONB NOT NULL DEFAULT '{}',
    "website" JSONB NOT NULL DEFAULT '{}',
    "stripeAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HorecaZaak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorecaTafel" (
    "id" TEXT NOT NULL,
    "zaakId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "plaatsen" INTEGER NOT NULL DEFAULT 4,
    "zone" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorecaTafel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorecaCategorie" (
    "id" TEXT NOT NULL,
    "zaakId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "volgorde" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HorecaCategorie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorecaItem" (
    "id" TEXT NOT NULL,
    "zaakId" TEXT NOT NULL,
    "categorieId" TEXT,
    "naam" TEXT NOT NULL,
    "omschrijving" TEXT NOT NULL DEFAULT '',
    "prijsCent" INTEGER NOT NULL,
    "allergenen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vegetarisch" BOOLEAN NOT NULL DEFAULT false,
    "veganistisch" BOOLEAN NOT NULL DEFAULT false,
    "beschikbaar" BOOLEAN NOT NULL DEFAULT true,
    "station" TEXT NOT NULL DEFAULT 'keuken',
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HorecaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorecaBestelling" (
    "id" TEXT NOT NULL,
    "zaakId" TEXT NOT NULL,
    "tafelId" TEXT,
    "nummer" INTEGER NOT NULL,
    "status" "HorecaBestellingStatus" NOT NULL DEFAULT 'NIEUW',
    "regels" JSONB NOT NULL,
    "totaalCent" INTEGER NOT NULL,
    "opmerking" TEXT NOT NULL DEFAULT '',
    "bron" TEXT NOT NULL DEFAULT 'qr',
    "naam" TEXT NOT NULL DEFAULT '',
    "betaald" BOOLEAN NOT NULL DEFAULT false,
    "betalingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HorecaBestelling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorecaBetaling" (
    "id" TEXT NOT NULL,
    "zaakId" TEXT NOT NULL,
    "tafelId" TEXT,
    "bedragCent" INTEGER NOT NULL,
    "fooiCent" INTEGER NOT NULL DEFAULT 0,
    "status" "HorecaBetalingStatus" NOT NULL DEFAULT 'OPEN',
    "stripeSessionId" TEXT,
    "bestellingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "betaaldOp" TIMESTAMP(3),

    CONSTRAINT "HorecaBetaling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorecaReservering" (
    "id" TEXT NOT NULL,
    "zaakId" TEXT NOT NULL,
    "tafelId" TEXT,
    "datum" TEXT NOT NULL,
    "tijd" TEXT NOT NULL,
    "personen" INTEGER NOT NULL,
    "naam" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefoon" TEXT NOT NULL,
    "opmerking" TEXT NOT NULL DEFAULT '',
    "status" "HorecaReserveringStatus" NOT NULL DEFAULT 'BEVESTIGD',
    "bron" TEXT NOT NULL DEFAULT 'online',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HorecaReservering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorecaTakenlijst" (
    "id" TEXT NOT NULL,
    "zaakId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "moment" TEXT NOT NULL DEFAULT 'dagelijks',
    "taken" JSONB NOT NULL DEFAULT '[]',
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorecaTakenlijst_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorecaAfvinking" (
    "id" TEXT NOT NULL,
    "lijstId" TEXT NOT NULL,
    "datum" TEXT NOT NULL,
    "taak" INTEGER NOT NULL,
    "door" TEXT NOT NULL,
    "waarde" TEXT NOT NULL DEFAULT '',
    "op" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorecaAfvinking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HorecaZaak_tenantId_key" ON "HorecaZaak"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HorecaZaak_slug_key" ON "HorecaZaak"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "HorecaTafel_code_key" ON "HorecaTafel"("code");

-- CreateIndex
CREATE INDEX "HorecaTafel_zaakId_idx" ON "HorecaTafel"("zaakId");

-- CreateIndex
CREATE INDEX "HorecaCategorie_zaakId_idx" ON "HorecaCategorie"("zaakId");

-- CreateIndex
CREATE INDEX "HorecaItem_zaakId_idx" ON "HorecaItem"("zaakId");

-- CreateIndex
CREATE INDEX "HorecaBestelling_zaakId_status_idx" ON "HorecaBestelling"("zaakId", "status");

-- CreateIndex
CREATE INDEX "HorecaBestelling_zaakId_createdAt_idx" ON "HorecaBestelling"("zaakId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HorecaBestelling_zaakId_nummer_key" ON "HorecaBestelling"("zaakId", "nummer");

-- CreateIndex
CREATE UNIQUE INDEX "HorecaBetaling_stripeSessionId_key" ON "HorecaBetaling"("stripeSessionId");

-- CreateIndex
CREATE INDEX "HorecaBetaling_zaakId_createdAt_idx" ON "HorecaBetaling"("zaakId", "createdAt");

-- CreateIndex
CREATE INDEX "HorecaReservering_zaakId_datum_idx" ON "HorecaReservering"("zaakId", "datum");

-- CreateIndex
CREATE INDEX "HorecaTakenlijst_zaakId_idx" ON "HorecaTakenlijst"("zaakId");

-- CreateIndex
CREATE UNIQUE INDEX "HorecaAfvinking_lijstId_datum_taak_key" ON "HorecaAfvinking"("lijstId", "datum", "taak");

-- AddForeignKey
ALTER TABLE "HorecaZaak" ADD CONSTRAINT "HorecaZaak_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaTafel" ADD CONSTRAINT "HorecaTafel_zaakId_fkey" FOREIGN KEY ("zaakId") REFERENCES "HorecaZaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaCategorie" ADD CONSTRAINT "HorecaCategorie_zaakId_fkey" FOREIGN KEY ("zaakId") REFERENCES "HorecaZaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaItem" ADD CONSTRAINT "HorecaItem_zaakId_fkey" FOREIGN KEY ("zaakId") REFERENCES "HorecaZaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaItem" ADD CONSTRAINT "HorecaItem_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "HorecaCategorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaBestelling" ADD CONSTRAINT "HorecaBestelling_zaakId_fkey" FOREIGN KEY ("zaakId") REFERENCES "HorecaZaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaBestelling" ADD CONSTRAINT "HorecaBestelling_tafelId_fkey" FOREIGN KEY ("tafelId") REFERENCES "HorecaTafel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaBetaling" ADD CONSTRAINT "HorecaBetaling_zaakId_fkey" FOREIGN KEY ("zaakId") REFERENCES "HorecaZaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaBetaling" ADD CONSTRAINT "HorecaBetaling_tafelId_fkey" FOREIGN KEY ("tafelId") REFERENCES "HorecaTafel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaReservering" ADD CONSTRAINT "HorecaReservering_zaakId_fkey" FOREIGN KEY ("zaakId") REFERENCES "HorecaZaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaReservering" ADD CONSTRAINT "HorecaReservering_tafelId_fkey" FOREIGN KEY ("tafelId") REFERENCES "HorecaTafel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaTakenlijst" ADD CONSTRAINT "HorecaTakenlijst_zaakId_fkey" FOREIGN KEY ("zaakId") REFERENCES "HorecaZaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorecaAfvinking" ADD CONSTRAINT "HorecaAfvinking_lijstId_fkey" FOREIGN KEY ("lijstId") REFERENCES "HorecaTakenlijst"("id") ON DELETE CASCADE ON UPDATE CASCADE;

