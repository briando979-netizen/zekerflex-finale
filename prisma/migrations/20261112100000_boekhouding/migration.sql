-- Boekhouding (dubbel boekhouden per administratie; lib/boekhouding). Alleen additief: nieuwe enums, tabellen, indexen,
-- foreign keys tussen de nieuwe tabellen, CHECK-constraints en triggers. Geen ALTER op bestaande tabellen, geen data.
-- Het eerste deel is de uitvoer van prisma migrate diff (schema voor -> schema na); het tweede deel is met de hand.

-- CreateEnum
CREATE TYPE "BoekAdministratieSoort" AS ENUM ('ECHT', 'TEST');

-- CreateEnum
CREATE TYPE "BoekRekeningSoort" AS ENUM ('ACTIVA', 'PASSIVA', 'OMZET', 'KOSTEN');

-- CreateEnum
CREATE TYPE "BoekDagboek" AS ENUM ('VERKOOP', 'INKOOP', 'BANK', 'MEMORIAAL');

-- CreateEnum
CREATE TYPE "BoekBron" AS ENUM ('FACTUUR', 'FACTUUR_BETALING', 'BON', 'BANK', 'MEMORIAAL', 'OPENING', 'TEGENBOEKING');

-- CreateEnum
CREATE TYPE "BoekBtwRichting" AS ENUM ('VERKOOP', 'INKOOP');

-- CreateEnum
CREATE TYPE "BoekPeriodeStatus" AS ENUM ('OPEN', 'VERGRENDELD');

-- CreateEnum
CREATE TYPE "BoekBonStatus" AS ENUM ('NIEUW', 'GELEZEN', 'EVEN_KIJKEN', 'GEBOEKT', 'AFGEWEZEN');

-- CreateEnum
CREATE TYPE "BoekAangifteStatus" AS ENUM ('BEREKEND', 'GOEDGEKEURD', 'INGEDIEND', 'VERVANGEN');

-- CreateEnum
CREATE TYPE "BoekBankFormaat" AS ENUM ('CAMT053', 'MT940', 'CSV');

-- CreateEnum
CREATE TYPE "BoekBankTransactieStatus" AS ENUM ('NIEUW', 'GEKOPPELD', 'TWIJFEL', 'GENEGEERD');

-- CreateTable
CREATE TABLE "BoekAdministratie" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "juridischeNaam" TEXT NOT NULL,
    "land" TEXT NOT NULL,
    "soort" "BoekAdministratieSoort" NOT NULL DEFAULT 'ECHT',
    "valuta" TEXT NOT NULL DEFAULT 'EUR',
    "rgsVersie" TEXT NOT NULL DEFAULT '3.7',
    "btwPlichtig" BOOLEAN NOT NULL DEFAULT false,
    "btwNummer" TEXT,
    "platformTenantId" TEXT,
    "boekjaarStartMaand" INTEGER NOT NULL DEFAULT 1,
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoekAdministratie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekRekening" (
    "id" TEXT NOT NULL,
    "administratieId" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "rgsCode" TEXT,
    "naam" TEXT NOT NULL,
    "soort" "BoekRekeningSoort" NOT NULL,
    "parentId" TEXT,
    "boekbaar" BOOLEAN NOT NULL DEFAULT true,
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoekRekening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekBtwCode" (
    "id" TEXT NOT NULL,
    "administratieId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "richting" "BoekBtwRichting" NOT NULL,
    "tariefBasispunten" INTEGER NOT NULL,
    "grondslagRubriek" TEXT,
    "btwRubriek" TEXT,
    "geldigVanaf" DATE NOT NULL,
    "geldigTot" DATE,
    "actief" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BoekBtwCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekPeriode" (
    "id" TEXT NOT NULL,
    "administratieId" TEXT NOT NULL,
    "jaar" INTEGER NOT NULL,
    "maand" INTEGER NOT NULL,
    "status" "BoekPeriodeStatus" NOT NULL DEFAULT 'OPEN',
    "vergrendeldOp" TIMESTAMP(3),
    "vergrendeldDoor" TEXT,

    CONSTRAINT "BoekPeriode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekVolgnummer" (
    "id" TEXT NOT NULL,
    "administratieId" TEXT NOT NULL,
    "dagboek" "BoekDagboek" NOT NULL,
    "jaar" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BoekVolgnummer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekBoeking" (
    "id" TEXT NOT NULL,
    "administratieId" TEXT NOT NULL,
    "dagboek" "BoekDagboek" NOT NULL,
    "boekstuk" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "omschrijving" TEXT NOT NULL,
    "bron" "BoekBron" NOT NULL,
    "bronId" TEXT NOT NULL,
    "bronHash" TEXT,
    "keertBoekingId" TEXT,
    "reden" TEXT,
    "aangemaaktDoor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoekBoeking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekRegel" (
    "id" TEXT NOT NULL,
    "boekingId" TEXT NOT NULL,
    "volgorde" INTEGER NOT NULL,
    "rekeningId" TEXT NOT NULL,
    "debetCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "omschrijving" TEXT,
    "btwCodeId" TEXT,
    "btwBasisCents" INTEGER,
    "isBtwRegel" BOOLEAN NOT NULL DEFAULT false,
    "postSleutel" TEXT,
    "origineleValuta" TEXT,
    "origineelCents" INTEGER,
    "koersMicro" INTEGER,

    CONSTRAINT "BoekRegel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekBon" (
    "id" TEXT NOT NULL,
    "administratieId" TEXT NOT NULL,
    "status" "BoekBonStatus" NOT NULL DEFAULT 'NIEUW',
    "bestandPad" TEXT NOT NULL,
    "bestandSha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "geuploadDoor" TEXT NOT NULL,
    "bewaarTot" DATE NOT NULL,
    "ocrTekst" TEXT,
    "ocrTekstHash" TEXT,
    "leverancier" TEXT,
    "leverancierNummer" TEXT,
    "bonDatum" DATE,
    "totaalCents" INTEGER,
    "btwCents" INTEGER,
    "valuta" TEXT,
    "btwCodeId" TEXT,
    "voorstelRekeningId" TEXT,
    "zekerheidPromille" INTEGER,
    "modelNaam" TEXT,
    "evenKijkenReden" TEXT,
    "afwijsReden" TEXT,
    "boekingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoekBon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekBtwPeriode" (
    "id" TEXT NOT NULL,
    "administratieId" TEXT NOT NULL,
    "jaar" INTEGER NOT NULL,
    "kwartaal" INTEGER NOT NULL,
    "vanaf" DATE NOT NULL,
    "totEnMet" DATE NOT NULL,
    "deadline" DATE NOT NULL,

    CONSTRAINT "BoekBtwPeriode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekBtwAangifte" (
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "versie" INTEGER NOT NULL,
    "status" "BoekAangifteStatus" NOT NULL DEFAULT 'BEREKEND',
    "rubrieken" JSONB NOT NULL,
    "totaalTeBetalenCents" INTEGER NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "berekendOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "goedgekeurdOp" TIMESTAMP(3),
    "goedgekeurdDoor" TEXT,
    "ingediendOp" TIMESTAMP(3),
    "indieningReferentie" TEXT,

    CONSTRAINT "BoekBtwAangifte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekBankRekening" (
    "id" TEXT NOT NULL,
    "administratieId" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "valuta" TEXT NOT NULL DEFAULT 'EUR',
    "rekeningId" TEXT NOT NULL,
    "actief" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BoekBankRekening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekBankAfschrift" (
    "id" TEXT NOT NULL,
    "bankRekeningId" TEXT NOT NULL,
    "formaat" "BoekBankFormaat" NOT NULL,
    "bestandPad" TEXT NOT NULL,
    "bestandSha256" TEXT NOT NULL,
    "afschriftNummer" TEXT,
    "vanaf" DATE,
    "totEnMet" DATE,
    "beginSaldoCents" INTEGER,
    "eindSaldoCents" INTEGER,
    "geuploadDoor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoekBankAfschrift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoekBankTransactie" (
    "id" TEXT NOT NULL,
    "bankRekeningId" TEXT NOT NULL,
    "afschriftId" TEXT,
    "status" "BoekBankTransactieStatus" NOT NULL DEFAULT 'NIEUW',
    "boekdatum" DATE NOT NULL,
    "valutadatum" DATE,
    "bedragCents" INTEGER NOT NULL,
    "valuta" TEXT NOT NULL,
    "tegenIban" TEXT,
    "tegenNaam" TEXT,
    "omschrijving" TEXT,
    "endToEndId" TEXT,
    "dedupeSleutel" TEXT NOT NULL,
    "voorstel" JSONB,
    "matchScorePromille" INTEGER,
    "boekingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoekBankTransactie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoekAdministratie_platformTenantId_key" ON "BoekAdministratie"("platformTenantId");

-- CreateIndex
CREATE INDEX "BoekRekening_administratieId_soort_idx" ON "BoekRekening"("administratieId", "soort");

-- CreateIndex
CREATE INDEX "BoekRekening_parentId_idx" ON "BoekRekening"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "BoekRekening_administratieId_nummer_key" ON "BoekRekening"("administratieId", "nummer");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBtwCode_administratieId_code_key" ON "BoekBtwCode"("administratieId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BoekPeriode_administratieId_jaar_maand_key" ON "BoekPeriode"("administratieId", "jaar", "maand");

-- CreateIndex
CREATE UNIQUE INDEX "BoekVolgnummer_administratieId_dagboek_jaar_key" ON "BoekVolgnummer"("administratieId", "dagboek", "jaar");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBoeking_keertBoekingId_key" ON "BoekBoeking"("keertBoekingId");

-- CreateIndex
CREATE INDEX "BoekBoeking_administratieId_datum_idx" ON "BoekBoeking"("administratieId", "datum");

-- CreateIndex
CREATE INDEX "BoekBoeking_bron_bronId_idx" ON "BoekBoeking"("bron", "bronId");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBoeking_administratieId_bron_bronId_key" ON "BoekBoeking"("administratieId", "bron", "bronId");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBoeking_administratieId_boekstuk_key" ON "BoekBoeking"("administratieId", "boekstuk");

-- CreateIndex
CREATE INDEX "BoekRegel_rekeningId_boekingId_idx" ON "BoekRegel"("rekeningId", "boekingId");

-- CreateIndex
CREATE INDEX "BoekRegel_postSleutel_idx" ON "BoekRegel"("postSleutel");

-- CreateIndex
CREATE INDEX "BoekRegel_btwCodeId_idx" ON "BoekRegel"("btwCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "BoekRegel_boekingId_volgorde_key" ON "BoekRegel"("boekingId", "volgorde");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBon_boekingId_key" ON "BoekBon"("boekingId");

-- CreateIndex
CREATE INDEX "BoekBon_administratieId_status_idx" ON "BoekBon"("administratieId", "status");

-- CreateIndex
CREATE INDEX "BoekBon_administratieId_leverancier_leverancierNummer_idx" ON "BoekBon"("administratieId", "leverancier", "leverancierNummer");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBon_administratieId_bestandSha256_key" ON "BoekBon"("administratieId", "bestandSha256");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBtwPeriode_administratieId_jaar_kwartaal_key" ON "BoekBtwPeriode"("administratieId", "jaar", "kwartaal");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBtwAangifte_periodeId_versie_key" ON "BoekBtwAangifte"("periodeId", "versie");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBankRekening_administratieId_iban_key" ON "BoekBankRekening"("administratieId", "iban");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBankAfschrift_bankRekeningId_bestandSha256_key" ON "BoekBankAfschrift"("bankRekeningId", "bestandSha256");

-- CreateIndex
CREATE INDEX "BoekBankTransactie_bankRekeningId_status_idx" ON "BoekBankTransactie"("bankRekeningId", "status");

-- CreateIndex
CREATE INDEX "BoekBankTransactie_boekdatum_idx" ON "BoekBankTransactie"("boekdatum");

-- CreateIndex
CREATE INDEX "BoekBankTransactie_boekingId_idx" ON "BoekBankTransactie"("boekingId");

-- CreateIndex
CREATE UNIQUE INDEX "BoekBankTransactie_bankRekeningId_dedupeSleutel_key" ON "BoekBankTransactie"("bankRekeningId", "dedupeSleutel");

-- AddForeignKey
ALTER TABLE "BoekRekening" ADD CONSTRAINT "BoekRekening_administratieId_fkey" FOREIGN KEY ("administratieId") REFERENCES "BoekAdministratie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekRekening" ADD CONSTRAINT "BoekRekening_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BoekRekening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBtwCode" ADD CONSTRAINT "BoekBtwCode_administratieId_fkey" FOREIGN KEY ("administratieId") REFERENCES "BoekAdministratie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekPeriode" ADD CONSTRAINT "BoekPeriode_administratieId_fkey" FOREIGN KEY ("administratieId") REFERENCES "BoekAdministratie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekVolgnummer" ADD CONSTRAINT "BoekVolgnummer_administratieId_fkey" FOREIGN KEY ("administratieId") REFERENCES "BoekAdministratie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBoeking" ADD CONSTRAINT "BoekBoeking_administratieId_fkey" FOREIGN KEY ("administratieId") REFERENCES "BoekAdministratie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBoeking" ADD CONSTRAINT "BoekBoeking_keertBoekingId_fkey" FOREIGN KEY ("keertBoekingId") REFERENCES "BoekBoeking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekRegel" ADD CONSTRAINT "BoekRegel_boekingId_fkey" FOREIGN KEY ("boekingId") REFERENCES "BoekBoeking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekRegel" ADD CONSTRAINT "BoekRegel_rekeningId_fkey" FOREIGN KEY ("rekeningId") REFERENCES "BoekRekening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekRegel" ADD CONSTRAINT "BoekRegel_btwCodeId_fkey" FOREIGN KEY ("btwCodeId") REFERENCES "BoekBtwCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBon" ADD CONSTRAINT "BoekBon_administratieId_fkey" FOREIGN KEY ("administratieId") REFERENCES "BoekAdministratie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBon" ADD CONSTRAINT "BoekBon_btwCodeId_fkey" FOREIGN KEY ("btwCodeId") REFERENCES "BoekBtwCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBon" ADD CONSTRAINT "BoekBon_boekingId_fkey" FOREIGN KEY ("boekingId") REFERENCES "BoekBoeking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBtwPeriode" ADD CONSTRAINT "BoekBtwPeriode_administratieId_fkey" FOREIGN KEY ("administratieId") REFERENCES "BoekAdministratie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBtwAangifte" ADD CONSTRAINT "BoekBtwAangifte_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "BoekBtwPeriode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBankRekening" ADD CONSTRAINT "BoekBankRekening_administratieId_fkey" FOREIGN KEY ("administratieId") REFERENCES "BoekAdministratie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBankRekening" ADD CONSTRAINT "BoekBankRekening_rekeningId_fkey" FOREIGN KEY ("rekeningId") REFERENCES "BoekRekening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBankAfschrift" ADD CONSTRAINT "BoekBankAfschrift_bankRekeningId_fkey" FOREIGN KEY ("bankRekeningId") REFERENCES "BoekBankRekening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBankTransactie" ADD CONSTRAINT "BoekBankTransactie_bankRekeningId_fkey" FOREIGN KEY ("bankRekeningId") REFERENCES "BoekBankRekening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBankTransactie" ADD CONSTRAINT "BoekBankTransactie_afschriftId_fkey" FOREIGN KEY ("afschriftId") REFERENCES "BoekBankAfschrift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoekBankTransactie" ADD CONSTRAINT "BoekBankTransactie_boekingId_fkey" FOREIGN KEY ("boekingId") REFERENCES "BoekBoeking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Met de hand toegevoegd (Prisma kent geen CHECK, functies of triggers). Alleen op de nieuwe Boek*-tabellen.
-- Terugdraaien: DROP TABLE van de 13 Boek*-tabellen (CASCADE), DROP FUNCTION boek_*, DROP TYPE van de 10 Boek*-enums.
-- Droge proef: prisma/dry-runs/boekhouding-droge-proef.sql (alles binnen BEGIN ... ROLLBACK).
-- ===========================================================================

-- ---- CHECK-constraints ------------------------------------------------------

ALTER TABLE "BoekAdministratie" ADD CONSTRAINT "BoekAdministratie_boekjaarStartMaand_check" CHECK ("boekjaarStartMaand" BETWEEN 1 AND 12);
ALTER TABLE "BoekAdministratie" ADD CONSTRAINT "BoekAdministratie_valuta_check" CHECK ("valuta" ~ '^[A-Z]{3}$');
ALTER TABLE "BoekBtwCode" ADD CONSTRAINT "BoekBtwCode_tarief_check" CHECK ("tariefBasispunten" BETWEEN 0 AND 10000);
ALTER TABLE "BoekPeriode" ADD CONSTRAINT "BoekPeriode_maand_check" CHECK ("maand" BETWEEN 1 AND 12);
ALTER TABLE "BoekBtwPeriode" ADD CONSTRAINT "BoekBtwPeriode_kwartaal_check" CHECK ("kwartaal" BETWEEN 1 AND 4);
ALTER TABLE "BoekBon" ADD CONSTRAINT "BoekBon_zekerheid_check" CHECK ("zekerheidPromille" IS NULL OR "zekerheidPromille" BETWEEN 0 AND 1000);

-- Een regel heeft precies een kant (debet of credit), nooit negatief, nooit een nulregel.
ALTER TABLE "BoekRegel" ADD CONSTRAINT "BoekRegel_een_kant" CHECK (
  "debetCents" >= 0 AND "creditCents" >= 0 AND (("debetCents" = 0) <> ("creditCents" = 0))
);

-- Geen persoonsgegevens in de boeking: geen e-mailadres (@) en geen Nederlands IBAN in omschrijving of reden.
-- (De applicatie is strenger: elke IBAN met geldig controlegetal, ook met spaties. Dit is alleen het vangnet voor scripts en
-- handmatige SQL; een bredere vorm in SQL zou een nummer met toevallig IBAN-vorm onterecht afkeuren.)
ALTER TABLE "BoekBoeking" ADD CONSTRAINT "BoekBoeking_geen_persoonsgegevens" CHECK (
  "omschrijving" !~ '@' AND "omschrijving" !~* '\mNL[0-9]{2}[A-Z]{4}[0-9]{10}\M'
  AND ("reden" IS NULL OR ("reden" !~ '@' AND "reden" !~* '\mNL[0-9]{2}[A-Z]{4}[0-9]{10}\M'))
);
ALTER TABLE "BoekBoeking" ADD CONSTRAINT "BoekBoeking_bronId_niet_leeg" CHECK ("bronId" <> '' AND "boekstuk" <> '');
ALTER TABLE "BoekRegel" ADD CONSTRAINT "BoekRegel_geen_persoonsgegevens" CHECK (
  "omschrijving" IS NULL OR ("omschrijving" !~ '@' AND "omschrijving" !~* '\mNL[0-9]{2}[A-Z]{4}[0-9]{10}\M')
);

-- ---- Hulpfuncties -------------------------------------------------------------

-- Is dit een TEST-administratie? Alleen daar mag UPDATE/DELETE (en wissen). Onbekend id = geen test.
CREATE FUNCTION boek_is_test_administratie(p_administratie TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT "soort" = 'TEST' FROM "BoekAdministratie" WHERE "id" = p_administratie), FALSE)
$$;

-- Sluit de boeking op 0 (debet = credit, in bigint) en heeft hij minstens twee regels? Een boeking die al weg is
-- (TEST-administratie gewist in dezelfde transactie) is niets om te controleren.
CREATE FUNCTION boek_controleer_sluiting(p_boeking TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_aantal INTEGER;
  v_debet BIGINT;
  v_credit BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "BoekBoeking" WHERE "id" = p_boeking) THEN
    RETURN;
  END IF;
  SELECT COUNT(*), COALESCE(SUM("debetCents"), 0), COALESCE(SUM("creditCents"), 0)
    INTO v_aantal, v_debet, v_credit
    FROM "BoekRegel" WHERE "boekingId" = p_boeking;
  IF v_aantal < 2 THEN
    RAISE EXCEPTION 'Boeking % heeft minder dan twee regels', p_boeking USING ERRCODE = 'check_violation';
  END IF;
  IF v_debet <> v_credit THEN
    RAISE EXCEPTION 'Boeking % sluit niet: debet % is niet gelijk aan credit %', p_boeking, v_debet, v_credit
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- ---- Sluiten op 0: uitgesteld tot COMMIT -----------------------------------------

CREATE FUNCTION boek_regel_sluiting_trigger() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM boek_controleer_sluiting(NEW."boekingId");
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "BoekRegel_sluit_op_nul"
  AFTER INSERT OR UPDATE ON "BoekRegel"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION boek_regel_sluiting_trigger();

-- Ook een boeking zonder enige regel moet bij COMMIT falen (de regel-trigger ziet die niet).
CREATE FUNCTION boek_boeking_sluiting_trigger() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM boek_controleer_sluiting(NEW."id");
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "BoekBoeking_sluit_op_nul"
  AFTER INSERT ON "BoekBoeking"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION boek_boeking_sluiting_trigger();

-- ---- Soort ECHT/TEST ---------------------------------------------------------------

-- De soort is na het aanmaken niet te wijzigen; een ECHTE administratie wordt nooit verwijderd.
CREATE FUNCTION boek_administratie_bewaken() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."soort" <> OLD."soort" THEN
      RAISE EXCEPTION 'BoekAdministratie: de soort (ECHT of TEST) is na het aanmaken niet te wijzigen'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."soort" <> 'TEST' THEN
    RAISE EXCEPTION 'BoekAdministratie: een echte administratie is onveranderlijk en wordt nooit verwijderd'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER "BoekAdministratie_bewaken"
  BEFORE UPDATE OR DELETE ON "BoekAdministratie"
  FOR EACH ROW EXECUTE FUNCTION boek_administratie_bewaken();

-- ---- Onveranderlijk: UPDATE/DELETE alleen in een TEST-administratie ---------------------

CREATE FUNCTION boek_boeking_onveranderlijk() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF boek_is_test_administratie(OLD."administratieId") THEN
    IF TG_OP = 'UPDATE' THEN
      IF NOT boek_is_test_administratie(NEW."administratieId") THEN
        RAISE EXCEPTION 'BoekBoeking is onveranderlijk: een boeking verhuist niet naar een echte administratie'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'BoekBoeking is onveranderlijk (% geweigerd): corrigeer met een tegenboeking', TG_OP
    USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER "BoekBoeking_onveranderlijk"
  BEFORE UPDATE OR DELETE ON "BoekBoeking"
  FOR EACH ROW EXECUTE FUNCTION boek_boeking_onveranderlijk();

CREATE FUNCTION boek_regel_onveranderlijk() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_oud TEXT;
  v_nieuw TEXT;
BEGIN
  SELECT "administratieId" INTO v_oud FROM "BoekBoeking" WHERE "id" = OLD."boekingId";
  IF boek_is_test_administratie(v_oud) THEN
    IF TG_OP = 'UPDATE' THEN
      SELECT "administratieId" INTO v_nieuw FROM "BoekBoeking" WHERE "id" = NEW."boekingId";
      IF NOT boek_is_test_administratie(v_nieuw) THEN
        RAISE EXCEPTION 'BoekRegel is onveranderlijk: een regel verhuist niet naar een echte administratie'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'BoekRegel is onveranderlijk (% geweigerd): corrigeer met een tegenboeking', TG_OP
    USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER "BoekRegel_onveranderlijk"
  BEFORE UPDATE OR DELETE ON "BoekRegel"
  FOR EACH ROW EXECUTE FUNCTION boek_regel_onveranderlijk();

-- TRUNCATE kent geen rijen en dus geen soort: altijd geweigerd (een TEST wis je met DELETE, zie test-wissen.ts).
CREATE FUNCTION boek_geen_truncate() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is onveranderlijk: TRUNCATE is niet toegestaan', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER "BoekBoeking_geen_truncate" BEFORE TRUNCATE ON "BoekBoeking"
  FOR EACH STATEMENT EXECUTE FUNCTION boek_geen_truncate();
CREATE TRIGGER "BoekRegel_geen_truncate" BEFORE TRUNCATE ON "BoekRegel"
  FOR EACH STATEMENT EXECUTE FUNCTION boek_geen_truncate();
CREATE TRIGGER "BoekAdministratie_geen_truncate" BEFORE TRUNCATE ON "BoekAdministratie"
  FOR EACH STATEMENT EXECUTE FUNCTION boek_geen_truncate();

-- ---- Nieuwe boeking: niet in een vergrendelde maand, en een tegenboeking keert alleen een eigen boeking ----

CREATE FUNCTION boek_boeking_invoegen_bewaken() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "BoekPeriode"
    WHERE "administratieId" = NEW."administratieId"
      AND "jaar" = EXTRACT(YEAR FROM NEW."datum")::INTEGER
      AND "maand" = EXTRACT(MONTH FROM NEW."datum")::INTEGER
      AND "status" = 'VERGRENDELD'
  ) THEN
    RAISE EXCEPTION 'De periode % is vergrendeld: in die maand komt geen nieuwe boeking', to_char(NEW."datum", 'YYYY-MM')
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."keertBoekingId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "BoekBoeking" WHERE "id" = NEW."keertBoekingId" AND "administratieId" = NEW."administratieId"
  ) THEN
    RAISE EXCEPTION 'Een tegenboeking keert alleen een boeking van dezelfde administratie'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "BoekBoeking_invoegen_bewaken"
  BEFORE INSERT ON "BoekBoeking"
  FOR EACH ROW EXECUTE FUNCTION boek_boeking_invoegen_bewaken();

-- ---- Een vergrendelde maand gaat niet meer open (alleen in een TEST-administratie wel) -------------

CREATE FUNCTION boek_periode_bewaken() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'VERGRENDELD' AND NOT boek_is_test_administratie(OLD."administratieId") THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Een vergrendelde periode wordt niet verwijderd' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."status" <> OLD."status" OR NEW."jaar" <> OLD."jaar" OR NEW."maand" <> OLD."maand"
       OR NEW."administratieId" <> OLD."administratieId" THEN
      RAISE EXCEPTION 'Een vergrendelde periode gaat niet meer open (alleen met een gedocumenteerde ingreep door de beheerder van de database)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "BoekPeriode_bewaken"
  BEFORE UPDATE OR DELETE ON "BoekPeriode"
  FOR EACH ROW EXECUTE FUNCTION boek_periode_bewaken();

-- ---- Btw-aangifte: de momentopname verandert niet (alleen status en indienvelden), en wordt niet verwijderd ----

CREATE FUNCTION boek_aangifte_bewaken() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_administratie TEXT;
BEGIN
  SELECT "administratieId" INTO v_administratie FROM "BoekBtwPeriode" WHERE "id" = OLD."periodeId";
  IF boek_is_test_administratie(v_administratie) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Een btw-aangifte wordt niet verwijderd: maak een nieuwe versie' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."periodeId" <> OLD."periodeId" OR NEW."versie" <> OLD."versie"
     OR NEW."rubrieken" IS DISTINCT FROM OLD."rubrieken"
     OR NEW."totaalTeBetalenCents" <> OLD."totaalTeBetalenCents"
     OR NEW."snapshotHash" <> OLD."snapshotHash"
     OR NEW."berekendOp" <> OLD."berekendOp" THEN
    RAISE EXCEPTION 'Een btw-aangifte is een momentopname: een herberekening is een nieuwe versie'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "BoekBtwAangifte_bewaken"
  BEFORE UPDATE OR DELETE ON "BoekBtwAangifte"
  FOR EACH ROW EXECUTE FUNCTION boek_aangifte_bewaken();
