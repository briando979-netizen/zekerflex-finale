-- Domeinnamen die een bedrijf via ZekerFlex bestelt (lib/domeinen/bestelling.ts). Alleen toevoegen.
CREATE TYPE "DomeinBestelStatus" AS ENUM ('OPEN', 'BETAALD', 'GEREGISTREERD', 'MISLUKT', 'GEANNULEERD');

CREATE TABLE "DomeinBestelling" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "domein" TEXT NOT NULL,
    "jaren" INTEGER NOT NULL DEFAULT 1,
    "prijsCent" INTEGER NOT NULL,
    "btwCent" INTEGER NOT NULL,
    "bundel" BOOLEAN NOT NULL DEFAULT false,
    "status" "DomeinBestelStatus" NOT NULL DEFAULT 'OPEN',
    "stripeSessionId" TEXT,
    "betaaldOp" TIMESTAMP(3),
    "afgerondOp" TIMESTAMP(3),
    "notitie" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomeinBestelling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomeinBestelling_stripeSessionId_key" ON "DomeinBestelling"("stripeSessionId");
CREATE INDEX "DomeinBestelling_tenantId_createdAt_idx" ON "DomeinBestelling"("tenantId", "createdAt");
CREATE INDEX "DomeinBestelling_status_idx" ON "DomeinBestelling"("status");
CREATE INDEX "DomeinBestelling_domein_idx" ON "DomeinBestelling"("domein");
