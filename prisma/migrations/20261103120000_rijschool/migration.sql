-- CreateEnum
CREATE TYPE "RijschoolLeerlingStatus" AS ENUM ('AANMELDING', 'ACTIEF', 'GESLAAGD', 'GESTOPT');

-- CreateEnum
CREATE TYPE "RijschoolLesSoort" AS ENUM ('LES', 'PROEFLES', 'TOETS', 'EXAMEN');

-- CreateEnum
CREATE TYPE "RijschoolLesStatus" AS ENUM ('GEPLAND', 'VOLTOOID', 'GEANNULEERD', 'NIET_VERSCHENEN');

-- CreateEnum
CREATE TYPE "RijschoolBetalingStatus" AS ENUM ('OPEN', 'BETAALD', 'MISLUKT', 'VERVALLEN');

-- CreateEnum
CREATE TYPE "RijschoolBetaalMethode" AS ENUM ('IDEAL', 'PIN', 'CONTANT', 'OVERBOEKING');

-- CreateTable
CREATE TABLE "Rijschool" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "plaats" TEXT NOT NULL DEFAULT '',
    "adres" TEXT NOT NULL DEFAULT '',
    "telefoon" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "kvk" TEXT NOT NULL DEFAULT '',
    "kleur" TEXT NOT NULL DEFAULT '#1D4E89',
    "accent" TEXT NOT NULL DEFAULT '#F2B544',
    "lesMinuten" INTEGER NOT NULL DEFAULT 60,
    "annuleerUren" INTEGER NOT NULL DEFAULT 24,
    "proeflesOnline" BOOLEAN NOT NULL DEFAULT true,
    "zelfPlannen" BOOLEAN NOT NULL DEFAULT false,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "website" JSONB NOT NULL DEFAULT '{}',
    "stripeAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rijschool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RijschoolInstructeur" (
    "id" TEXT NOT NULL,
    "rijschoolId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefoon" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "categorieen" TEXT[] DEFAULT ARRAY['B']::TEXT[],
    "beschikbaarheid" JSONB NOT NULL DEFAULT '[]',
    "kleur" TEXT NOT NULL DEFAULT '#1D4E89',
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "wachtwoordHash" TEXT,
    "uitnodigingHash" TEXT,
    "uitnodigingTot" TIMESTAMP(3),
    "laatstIngelogd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RijschoolInstructeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RijschoolVoertuig" (
    "id" TEXT NOT NULL,
    "rijschoolId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "kenteken" TEXT NOT NULL DEFAULT '',
    "automaat" BOOLEAN NOT NULL DEFAULT false,
    "categorie" TEXT NOT NULL DEFAULT 'B',
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RijschoolVoertuig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RijschoolProduct" (
    "id" TEXT NOT NULL,
    "rijschoolId" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "omschrijving" TEXT NOT NULL DEFAULT '',
    "soort" TEXT NOT NULL DEFAULT 'PAKKET',
    "prijsCent" INTEGER NOT NULL,
    "lessen" INTEGER NOT NULL DEFAULT 0,
    "lesMinuten" INTEGER NOT NULL DEFAULT 60,
    "examen" BOOLEAN NOT NULL DEFAULT false,
    "zichtbaar" BOOLEAN NOT NULL DEFAULT true,
    "populair" BOOLEAN NOT NULL DEFAULT false,
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RijschoolProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RijschoolLeerling" (
    "id" TEXT NOT NULL,
    "rijschoolId" TEXT NOT NULL,
    "instructeurId" TEXT,
    "naam" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefoon" TEXT NOT NULL DEFAULT '',
    "adres" TEXT NOT NULL DEFAULT '',
    "geboortedatum" TIMESTAMP(3),
    "automaat" BOOLEAN NOT NULL DEFAULT false,
    "status" "RijschoolLeerlingStatus" NOT NULL DEFAULT 'AANMELDING',
    "theorieGehaald" BOOLEAN NOT NULL DEFAULT false,
    "examenDatum" TIMESTAMP(3),
    "notitie" TEXT NOT NULL DEFAULT '',
    "theorie" JSONB NOT NULL DEFAULT '{}',
    "wachtwoordHash" TEXT,
    "uitnodigingHash" TEXT,
    "uitnodigingTot" TIMESTAMP(3),
    "laatstIngelogd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RijschoolLeerling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RijschoolLes" (
    "id" TEXT NOT NULL,
    "rijschoolId" TEXT NOT NULL,
    "leerlingId" TEXT,
    "instructeurId" TEXT NOT NULL,
    "voertuigId" TEXT,
    "soort" "RijschoolLesSoort" NOT NULL DEFAULT 'LES',
    "status" "RijschoolLesStatus" NOT NULL DEFAULT 'GEPLAND',
    "start" TIMESTAMP(3) NOT NULL,
    "eind" TIMESTAMP(3) NOT NULL,
    "ophaaladres" TEXT NOT NULL DEFAULT '',
    "beoordeling" JSONB NOT NULL DEFAULT '{}',
    "verslag" TEXT NOT NULL DEFAULT '',
    "huiswerk" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interneNotitie" TEXT NOT NULL DEFAULT '',
    "gestartOm" TIMESTAMP(3),
    "afgerondOm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RijschoolLes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RijschoolTegoed" (
    "id" TEXT NOT NULL,
    "leerlingId" TEXT NOT NULL,
    "minuten" INTEGER NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "lesId" TEXT,
    "betalingId" TEXT,
    "door" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RijschoolTegoed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RijschoolBetaling" (
    "id" TEXT NOT NULL,
    "rijschoolId" TEXT NOT NULL,
    "leerlingId" TEXT NOT NULL,
    "productId" TEXT,
    "omschrijving" TEXT NOT NULL,
    "bedragCent" INTEGER NOT NULL,
    "status" "RijschoolBetalingStatus" NOT NULL DEFAULT 'OPEN',
    "methode" "RijschoolBetaalMethode",
    "stripeSessionId" TEXT,
    "betaaldOm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RijschoolBetaling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rijschool_tenantId_key" ON "Rijschool"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Rijschool_slug_key" ON "Rijschool"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolInstructeur_uitnodigingHash_key" ON "RijschoolInstructeur"("uitnodigingHash");

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolInstructeur_rijschoolId_email_key" ON "RijschoolInstructeur"("rijschoolId", "email");

-- CreateIndex
CREATE INDEX "RijschoolVoertuig_rijschoolId_idx" ON "RijschoolVoertuig"("rijschoolId");

-- CreateIndex
CREATE INDEX "RijschoolProduct_rijschoolId_idx" ON "RijschoolProduct"("rijschoolId");

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolLeerling_uitnodigingHash_key" ON "RijschoolLeerling"("uitnodigingHash");

-- CreateIndex
CREATE INDEX "RijschoolLeerling_rijschoolId_status_idx" ON "RijschoolLeerling"("rijschoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolLeerling_rijschoolId_email_key" ON "RijschoolLeerling"("rijschoolId", "email");

-- CreateIndex
CREATE INDEX "RijschoolLes_rijschoolId_start_idx" ON "RijschoolLes"("rijschoolId", "start");

-- CreateIndex
CREATE INDEX "RijschoolLes_instructeurId_start_idx" ON "RijschoolLes"("instructeurId", "start");

-- CreateIndex
CREATE INDEX "RijschoolLes_leerlingId_start_idx" ON "RijschoolLes"("leerlingId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolTegoed_lesId_key" ON "RijschoolTegoed"("lesId");

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolTegoed_betalingId_key" ON "RijschoolTegoed"("betalingId");

-- CreateIndex
CREATE INDEX "RijschoolTegoed_leerlingId_idx" ON "RijschoolTegoed"("leerlingId");

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolBetaling_stripeSessionId_key" ON "RijschoolBetaling"("stripeSessionId");

-- CreateIndex
CREATE INDEX "RijschoolBetaling_rijschoolId_status_idx" ON "RijschoolBetaling"("rijschoolId", "status");

-- CreateIndex
CREATE INDEX "RijschoolBetaling_leerlingId_idx" ON "RijschoolBetaling"("leerlingId");

-- AddForeignKey
ALTER TABLE "Rijschool" ADD CONSTRAINT "Rijschool_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolInstructeur" ADD CONSTRAINT "RijschoolInstructeur_rijschoolId_fkey" FOREIGN KEY ("rijschoolId") REFERENCES "Rijschool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolVoertuig" ADD CONSTRAINT "RijschoolVoertuig_rijschoolId_fkey" FOREIGN KEY ("rijschoolId") REFERENCES "Rijschool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolProduct" ADD CONSTRAINT "RijschoolProduct_rijschoolId_fkey" FOREIGN KEY ("rijschoolId") REFERENCES "Rijschool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolLeerling" ADD CONSTRAINT "RijschoolLeerling_rijschoolId_fkey" FOREIGN KEY ("rijschoolId") REFERENCES "Rijschool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolLeerling" ADD CONSTRAINT "RijschoolLeerling_instructeurId_fkey" FOREIGN KEY ("instructeurId") REFERENCES "RijschoolInstructeur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolLes" ADD CONSTRAINT "RijschoolLes_rijschoolId_fkey" FOREIGN KEY ("rijschoolId") REFERENCES "Rijschool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolLes" ADD CONSTRAINT "RijschoolLes_leerlingId_fkey" FOREIGN KEY ("leerlingId") REFERENCES "RijschoolLeerling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolLes" ADD CONSTRAINT "RijschoolLes_instructeurId_fkey" FOREIGN KEY ("instructeurId") REFERENCES "RijschoolInstructeur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolLes" ADD CONSTRAINT "RijschoolLes_voertuigId_fkey" FOREIGN KEY ("voertuigId") REFERENCES "RijschoolVoertuig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolTegoed" ADD CONSTRAINT "RijschoolTegoed_leerlingId_fkey" FOREIGN KEY ("leerlingId") REFERENCES "RijschoolLeerling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolTegoed" ADD CONSTRAINT "RijschoolTegoed_lesId_fkey" FOREIGN KEY ("lesId") REFERENCES "RijschoolLes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolTegoed" ADD CONSTRAINT "RijschoolTegoed_betalingId_fkey" FOREIGN KEY ("betalingId") REFERENCES "RijschoolBetaling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolBetaling" ADD CONSTRAINT "RijschoolBetaling_rijschoolId_fkey" FOREIGN KEY ("rijschoolId") REFERENCES "Rijschool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolBetaling" ADD CONSTRAINT "RijschoolBetaling_leerlingId_fkey" FOREIGN KEY ("leerlingId") REFERENCES "RijschoolLeerling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolBetaling" ADD CONSTRAINT "RijschoolBetaling_productId_fkey" FOREIGN KEY ("productId") REFERENCES "RijschoolProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

