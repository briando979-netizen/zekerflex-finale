-- CreateEnum for OefenKlusAanmeldingStatus
CREATE TYPE "OefenKlusAanmeldingStatus" AS ENUM ('AANGEMELD', 'GEACCEPTEERD', 'GEWEIGERD', 'AFGEROND', 'GEANNULEERD');

-- CreateTable OefenKlus
CREATE TABLE "OefenKlus" (
    "id" TEXT NOT NULL,
    "zaakId" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "beschrijving" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "startTijd" TEXT NOT NULL,
    "eindTijd" TEXT NOT NULL,
    "maxAanmeldingen" INTEGER NOT NULL DEFAULT 5,
    "niveau" TEXT NOT NULL DEFAULT 'beginner',
    "vereisten" TEXT NOT NULL DEFAULT '',
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OefenKlus_pkey" PRIMARY KEY ("id")
);

-- CreateTable OefenKlusAanmelding
CREATE TABLE "OefenKlusAanmelding" (
    "id" TEXT NOT NULL,
    "oefenKlusId" TEXT NOT NULL,
    "voornaam" TEXT NOT NULL,
    "achternaam" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefoon" TEXT NOT NULL DEFAULT '',
    "ervaring" TEXT NOT NULL,
    "opmerkingen" TEXT NOT NULL DEFAULT '',
    "status" "OefenKlusAanmeldingStatus" NOT NULL DEFAULT 'AANGEMELD',
    "notitieZaak" TEXT NOT NULL DEFAULT '',
    "afgerondOp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OefenKlusAanmelding_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey for OefenKlus
ALTER TABLE "OefenKlus" ADD CONSTRAINT "OefenKlus_zaakId_fkey" FOREIGN KEY ("zaakId") REFERENCES "HorecaZaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for OefenKlusAanmelding
ALTER TABLE "OefenKlusAanmelding" ADD CONSTRAINT "OefenKlusAanmelding_oefenKlusId_fkey" FOREIGN KEY ("oefenKlusId") REFERENCES "OefenKlus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex for OefenKlus
CREATE INDEX "OefenKlus_zaakId_actief_idx" ON "OefenKlus"("zaakId", "actief");
CREATE INDEX "OefenKlus_datum_idx" ON "OefenKlus"("datum");

-- CreateIndex for OefenKlusAanmelding
CREATE UNIQUE INDEX "OefenKlusAanmelding_oefenKlusId_email_key" ON "OefenKlusAanmelding"("oefenKlusId", "email");
CREATE INDEX "OefenKlusAanmelding_oefenKlusId_status_idx" ON "OefenKlusAanmelding"("oefenKlusId", "status");
CREATE INDEX "OefenKlusAanmelding_email_idx" ON "OefenKlusAanmelding"("email");
