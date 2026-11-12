-- Droge proef voor de migratie 20261112100000_boekhouding. Alles gebeurt binnen BEGIN ... ROLLBACK: er blijft niets staan.
--
-- Draaien (vanuit de map prisma/dry-runs, zodat \ir de migratie vindt), zonder ON_ERROR_STOP:
--   psql -X -f boekhouding-droge-proef.sql
-- Op de VPS: kopieer prisma/dry-runs en prisma/migrations/20261112100000_boekhouding naar dezelfde mapstructuur in de
-- postgres-container en draai dit bestand daar met -f (niet via een pijp met -i zonder heredoc).
-- Niet nodig: \set ON_ERROR_STOP. Verwachte fouten worden met EXCEPTION WHEN opgevangen, dus psql eindigt met exitcode 0.
--
-- Uitkomst: per stap een melding "OK" of "FOUT" (NOTICE) en onderaan een overzicht + "ALLES OK" of "ER ZIJN FOUTEN".
-- "Bij COMMIT falen" wordt bewezen met SET CONSTRAINTS ALL IMMEDIATE: dat voert de uitgestelde controle meteen uit,
-- precies zoals COMMIT dat doet.
--
-- Let op: de migratie wordt hier binnen dezelfde transactie uitgevoerd; draai dit dus op een database waar de
-- Boek*-tabellen nog NIET bestaan (productie vóór de migratie), of op een wegwerpdatabase.

\set QUIET on
BEGIN;

\ir ../migrations/20261112100000_boekhouding/migration.sql

SET CONSTRAINTS ALL DEFERRED;

CREATE TEMP TABLE proef_uitslag (volgnr SERIAL, stap TEXT, ok BOOLEAN, toelichting TEXT);

CREATE FUNCTION pg_temp.proef_meld(p_stap TEXT, p_ok BOOLEAN, p_toelichting TEXT) RETURNS VOID
LANGUAGE plpgsql AS $f$
BEGIN
  INSERT INTO proef_uitslag (stap, ok, toelichting) VALUES (p_stap, p_ok, p_toelichting);
  IF p_ok THEN
    RAISE NOTICE 'OK    %: %', p_stap, p_toelichting;
  ELSE
    RAISE NOTICE 'FOUT  %: %', p_stap, p_toelichting;
  END IF;
END
$f$;

-- Voert de opdrachten uit en verwacht dat het GEWEIGERD wordt met een foutmelding die p_verwacht bevat.
-- Alles wat de opdrachten deden wordt teruggedraaid (subtransactie), ook als ze toch lukken.
CREATE FUNCTION pg_temp.proef_weigert(p_stap TEXT, p_sqls TEXT[], p_verwacht TEXT) RETURNS VOID
LANGUAGE plpgsql AS $f$
DECLARE
  v_sql TEXT;
  v_msg TEXT;
BEGIN
  BEGIN
    FOREACH v_sql IN ARRAY p_sqls LOOP
      EXECUTE v_sql;
    END LOOP;
    RAISE EXCEPTION 'proef_niet_geweigerd';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg = 'proef_niet_geweigerd' THEN
    PERFORM pg_temp.proef_meld(p_stap, FALSE, 'is NIET geweigerd');
  ELSIF position(p_verwacht IN v_msg) > 0 THEN
    PERFORM pg_temp.proef_meld(p_stap, TRUE, 'geweigerd: ' || v_msg);
  ELSE
    PERFORM pg_temp.proef_meld(p_stap, FALSE, 'geweigerd om een andere reden dan verwacht (' || p_verwacht || '): ' || v_msg);
  END IF;
END
$f$;

-- Voert de opdrachten uit en verwacht dat ze LUKKEN; de gevolgen blijven staan (voor de volgende stappen).
CREATE FUNCTION pg_temp.proef_slaagt(p_stap TEXT, p_sqls TEXT[]) RETURNS VOID
LANGUAGE plpgsql AS $f$
DECLARE
  v_sql TEXT;
  v_msg TEXT;
BEGIN
  BEGIN
    FOREACH v_sql IN ARRAY p_sqls LOOP
      EXECUTE v_sql;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg IS NULL THEN
    PERFORM pg_temp.proef_meld(p_stap, TRUE, 'gelukt');
  ELSE
    PERFORM pg_temp.proef_meld(p_stap, FALSE, 'had moeten lukken, maar: ' || v_msg);
  END IF;
END
$f$;

-- Stap 0: de migratie heeft alle tabellen en triggers aangemaakt.
DO $f$
DECLARE
  v_tabellen INTEGER;
  v_triggers INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_tabellen FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name LIKE 'Boek%';
  PERFORM pg_temp.proef_meld('0a tabellen', v_tabellen = 13, v_tabellen || ' Boek*-tabellen (verwacht 13)');
  SELECT COUNT(*) INTO v_triggers FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname LIKE 'Boek%';
  PERFORM pg_temp.proef_meld('0b triggers', v_triggers = 11, v_triggers || ' triggers (verwacht 11)');
END
$f$;

\o /dev/null
-- Voorbereiding: een ECHTE en een TEST-administratie, elk met twee rekeningen.
SELECT pg_temp.proef_slaagt('0c voorbereiding', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekAdministratie" (id, naam, "juridischeNaam", land) VALUES ('p_echt', 'Proef echt', 'Proef echt', 'NL')$s$,
  $s$INSERT INTO "BoekAdministratie" (id, naam, "juridischeNaam", land, soort) VALUES ('p_test', 'Proef test', 'Proef test', 'NL', 'TEST')$s$,
  $s$INSERT INTO "BoekAdministratie" (id, naam, "juridischeNaam", land) VALUES ('p_echt_leeg', 'Proef leeg', 'Proef leeg', 'NL')$s$,
  $s$INSERT INTO "BoekRekening" (id, "administratieId", nummer, naam, soort) VALUES
       ('r_e1', 'p_echt', '1100', 'Bank', 'ACTIVA'), ('r_e2', 'p_echt', '8000', 'Omzet', 'OMZET'),
       ('r_t1', 'p_test', '1100', 'Bank', 'ACTIVA'), ('r_t2', 'p_test', '8000', 'Omzet', 'OMZET')$s$
]);

-- Stap a: een sluitende boeking wordt geaccepteerd; een boeking die niet sluit faalt bij COMMIT.
SELECT pg_temp.proef_slaagt('a0 sluitende boeking (echt) wordt geaccepteerd', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_e1', 'p_echt', 'VERKOOP', 'VK-2026-000001', '2026-04-10', 'Factuur F-2026-0001', 'FACTUUR', 'inv1', 'systeem')$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents") VALUES ('g_e1', 'b_e1', 1, 'r_e1', 12100)$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "creditCents") VALUES ('g_e2', 'b_e1', 2, 'r_e2', 12100)$s$,
  $s$SET CONSTRAINTS ALL IMMEDIATE$s$,
  $s$SET CONSTRAINTS ALL DEFERRED$s$
]);

SELECT pg_temp.proef_weigert('a1 boeking die niet sluit faalt bij COMMIT', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_x1', 'p_echt', 'VERKOOP', 'VK-2026-000002', '2026-04-11', 'Factuur F-2026-0002', 'FACTUUR', 'inv2', 'systeem')$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents") VALUES ('g_x1', 'b_x1', 1, 'r_e1', 12100)$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "creditCents") VALUES ('g_x2', 'b_x1', 2, 'r_e2', 10000)$s$,
  $s$SET CONSTRAINTS ALL IMMEDIATE$s$
], 'sluit niet');

SELECT pg_temp.proef_weigert('a2 boeking met maar een regel faalt bij COMMIT', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_x2', 'p_echt', 'VERKOOP', 'VK-2026-000003', '2026-04-11', 'Factuur F-2026-0003', 'FACTUUR', 'inv3', 'systeem')$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents") VALUES ('g_x3', 'b_x2', 1, 'r_e1', 100)$s$,
  $s$SET CONSTRAINTS ALL IMMEDIATE$s$
], 'minder dan twee regels');

SELECT pg_temp.proef_weigert('a3 boeking zonder regels faalt bij COMMIT', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_x3', 'p_echt', 'VERKOOP', 'VK-2026-000004', '2026-04-11', 'Factuur F-2026-0004', 'FACTUUR', 'inv4', 'systeem')$s$,
  $s$SET CONSTRAINTS ALL IMMEDIATE$s$
], 'minder dan twee regels');

SELECT pg_temp.proef_weigert('a4 regel met debet en credit tegelijk wordt geweigerd', ARRAY[
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents", "creditCents") VALUES ('g_x4', 'b_e1', 9, 'r_e1', 5, 5)$s$
], 'BoekRegel_een_kant');

SELECT pg_temp.proef_weigert('a5 regel met negatief bedrag wordt geweigerd', ARRAY[
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents") VALUES ('g_x5', 'b_e1', 9, 'r_e1', -5)$s$
], 'BoekRegel_een_kant');

-- Stap b: UPDATE en DELETE op een ECHTE administratie falen.
SELECT pg_temp.proef_weigert('b1 UPDATE boeking (echt)', ARRAY[
  $s$UPDATE "BoekBoeking" SET omschrijving = 'Anders' WHERE id = 'b_e1'$s$], 'onveranderlijk');
SELECT pg_temp.proef_weigert('b2 DELETE boeking (echt)', ARRAY[
  $s$DELETE FROM "BoekBoeking" WHERE id = 'b_e1'$s$], 'onveranderlijk');
SELECT pg_temp.proef_weigert('b3 UPDATE regel (echt)', ARRAY[
  $s$UPDATE "BoekRegel" SET "debetCents" = 1 WHERE id = 'g_e1'$s$], 'onveranderlijk');
SELECT pg_temp.proef_weigert('b4 DELETE regel (echt)', ARRAY[
  $s$DELETE FROM "BoekRegel" WHERE id = 'g_e1'$s$], 'onveranderlijk');
SELECT pg_temp.proef_weigert('b5 TRUNCATE regels', ARRAY[
  $s$TRUNCATE "BoekRegel"$s$], 'TRUNCATE is niet toegestaan');
SELECT pg_temp.proef_weigert('b6 DELETE echte administratie (zonder boekingen)', ARRAY[
  $s$DELETE FROM "BoekAdministratie" WHERE id = 'p_echt_leeg'$s$], 'wordt nooit verwijderd');
SELECT pg_temp.proef_weigert('b7 boeking verhuizen van TEST naar ECHT', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_t0', 'p_test', 'VERKOOP', 'VK-2026-000001', '2026-04-10', 'Factuur F-2026-0001', 'FACTUUR', 'inv1', 'systeem')$s$,
  $s$UPDATE "BoekBoeking" SET "administratieId" = 'p_echt' WHERE id = 'b_t0'$s$
], 'niet naar een echte administratie');

-- Stap c: in een TEST-administratie mag UPDATE en DELETE wel.
SELECT pg_temp.proef_slaagt('c0 sluitende boeking (test)', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_t1', 'p_test', 'VERKOOP', 'VK-2026-000001', '2026-04-10', 'Factuur F-2026-0001', 'FACTUUR', 'inv1', 'systeem')$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents") VALUES ('g_t1', 'b_t1', 1, 'r_t1', 500)$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "creditCents") VALUES ('g_t2', 'b_t1', 2, 'r_t2', 500)$s$,
  $s$SET CONSTRAINTS ALL IMMEDIATE$s$,
  $s$SET CONSTRAINTS ALL DEFERRED$s$
]);
SELECT pg_temp.proef_slaagt('c1 UPDATE boeking (test)', ARRAY[
  $s$UPDATE "BoekBoeking" SET omschrijving = 'Factuur F-2026-0099' WHERE id = 'b_t1'$s$]);
SELECT pg_temp.proef_slaagt('c2 DELETE regels en boeking (test); een uitgestelde controle op verwijderde rijen geeft geen valse fout', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_t2', 'p_test', 'VERKOOP', 'VK-2026-000002', '2026-04-11', 'Factuur F-2026-0002', 'FACTUUR', 'inv2', 'systeem')$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents") VALUES ('g_t3', 'b_t2', 1, 'r_t1', 70)$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "creditCents") VALUES ('g_t4', 'b_t2', 2, 'r_t2', 70)$s$,
  $s$DELETE FROM "BoekRegel" WHERE "boekingId" IN ('b_t1', 'b_t2')$s$,
  $s$DELETE FROM "BoekBoeking" WHERE id IN ('b_t1', 'b_t2')$s$,
  $s$SET CONSTRAINTS ALL IMMEDIATE$s$,
  $s$SET CONSTRAINTS ALL DEFERRED$s$
]);
SELECT pg_temp.proef_slaagt('c3 DELETE test-administratie met rekeningen verwijderd', ARRAY[
  $s$DELETE FROM "BoekRekening" WHERE "administratieId" = 'p_test'$s$,
  $s$DELETE FROM "BoekAdministratie" WHERE id = 'p_test'$s$
]);
DO $f$
BEGIN
  PERFORM pg_temp.proef_meld('c4 test-administratie is weg',
    NOT EXISTS (SELECT 1 FROM "BoekAdministratie" WHERE id = 'p_test'), 'p_test bestaat niet meer');
END
$f$;

-- Stap d: een nieuwe boeking in een vergrendelde maand faalt; een vergrendelde maand gaat niet open.
SELECT pg_temp.proef_slaagt('d0 maart 2026 vergrendelen', ARRAY[
  $s$INSERT INTO "BoekPeriode" (id, "administratieId", jaar, maand, status) VALUES ('pe_3', 'p_echt', 2026, 3, 'VERGRENDELD')$s$]);
SELECT pg_temp.proef_weigert('d1 INSERT in vergrendelde maand', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_v1', 'p_echt', 'VERKOOP', 'VK-2026-000010', '2026-03-31', 'Factuur F-2026-0010', 'FACTUUR', 'inv10', 'systeem')$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents") VALUES ('g_v1', 'b_v1', 1, 'r_e1', 100)$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "creditCents") VALUES ('g_v2', 'b_v1', 2, 'r_e2', 100)$s$,
  $s$SET CONSTRAINTS ALL IMMEDIATE$s$
], 'vergrendeld');
SELECT pg_temp.proef_weigert('d2 vergrendelde maand weer openzetten (echt)', ARRAY[
  $s$UPDATE "BoekPeriode" SET status = 'OPEN' WHERE id = 'pe_3'$s$], 'gaat niet meer open');
SELECT pg_temp.proef_weigert('d3 vergrendelde maand verwijderen (echt)', ARRAY[
  $s$DELETE FROM "BoekPeriode" WHERE id = 'pe_3'$s$], 'wordt niet verwijderd');
SELECT pg_temp.proef_slaagt('d4 boeking in een open maand (april) lukt wel', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_v2', 'p_echt', 'VERKOOP', 'VK-2026-000011', '2026-04-01', 'Factuur F-2026-0011', 'FACTUUR', 'inv11', 'systeem')$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "debetCents") VALUES ('g_v3', 'b_v2', 1, 'r_e1', 100)$s$,
  $s$INSERT INTO "BoekRegel" (id, "boekingId", volgorde, "rekeningId", "creditCents") VALUES ('g_v4', 'b_v2', 2, 'r_e2', 100)$s$,
  $s$SET CONSTRAINTS ALL IMMEDIATE$s$,
  $s$SET CONSTRAINTS ALL DEFERRED$s$
]);

-- Stap e: dubbele (administratie, bron, bronId) faalt.
SELECT pg_temp.proef_weigert('e1 dubbele (administratie, bron, bronId)', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_d1', 'p_echt', 'VERKOOP', 'VK-2026-000099', '2026-04-12', 'Factuur F-2026-0001', 'FACTUUR', 'inv1', 'systeem')$s$
], 'BoekBoeking_administratieId_bron_bronId_key');
SELECT pg_temp.proef_weigert('e2 dubbel boekstuknummer', ARRAY[
  $s$SET CONSTRAINTS ALL DEFERRED$s$,
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_d2', 'p_echt', 'VERKOOP', 'VK-2026-000001', '2026-04-12', 'Factuur F-2026-0050', 'FACTUUR', 'inv50', 'systeem')$s$
], 'BoekBoeking_administratieId_boekstuk_key');

-- Stap f: de soort van een administratie wijzigen faalt, in beide richtingen.
SELECT pg_temp.proef_weigert('f1 soort ECHT -> TEST', ARRAY[
  $s$UPDATE "BoekAdministratie" SET soort = 'TEST' WHERE id = 'p_echt'$s$], 'niet te wijzigen');
SELECT pg_temp.proef_slaagt('f2 voorbereiding: een tweede test-administratie', ARRAY[
  $s$INSERT INTO "BoekAdministratie" (id, "naam", "juridischeNaam", land, soort) VALUES ('p_test2', 'Proef test 2', 'Proef test 2', 'NL', 'TEST')$s$]);
SELECT pg_temp.proef_weigert('f3 soort TEST -> ECHT', ARRAY[
  $s$UPDATE "BoekAdministratie" SET soort = 'ECHT' WHERE id = 'p_test2'$s$], 'niet te wijzigen');

-- Stap g: geen persoonsgegevens in de boeking (vangnet in de database).
SELECT pg_temp.proef_weigert('g1 e-mailadres in omschrijving', ARRAY[
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_p1', 'p_echt', 'MEMORIAAL', 'MM-2026-000001', '2026-04-12', 'Factuur van jan@voorbeeld.nl', 'MEMORIAAL', 'm1', 'systeem')$s$
], 'BoekBoeking_geen_persoonsgegevens');
SELECT pg_temp.proef_weigert('g2 IBAN in omschrijving', ARRAY[
  $s$INSERT INTO "BoekBoeking" (id, "administratieId", dagboek, boekstuk, datum, omschrijving, bron, "bronId", "aangemaaktDoor")
       VALUES ('b_p2', 'p_echt', 'MEMORIAAL', 'MM-2026-000002', '2026-04-12', 'Betaling naar NL91ABNA0417164300', 'MEMORIAAL', 'm2', 'systeem')$s$
], 'BoekBoeking_geen_persoonsgegevens');

-- Stap h: een btw-aangifte is een momentopname.
SELECT pg_temp.proef_slaagt('h0 aangifte aanmaken', ARRAY[
  $s$INSERT INTO "BoekBtwPeriode" (id, "administratieId", jaar, kwartaal, vanaf, "totEnMet", deadline)
       VALUES ('bp_1', 'p_echt', 2026, 1, '2026-01-01', '2026-03-31', '2026-04-30')$s$,
  $s$INSERT INTO "BoekBtwAangifte" (id, "periodeId", versie, rubrieken, "totaalTeBetalenCents", "snapshotHash")
       VALUES ('ba_1', 'bp_1', 1, '{}'::jsonb, 0, 'hash')$s$
]);
SELECT pg_temp.proef_weigert('h1 rubrieken van een aangifte wijzigen', ARRAY[
  $s$UPDATE "BoekBtwAangifte" SET rubrieken = '{"1a": {"btwCents": 5}}'::jsonb WHERE id = 'ba_1'$s$], 'momentopname');
SELECT pg_temp.proef_slaagt('h2 status van een aangifte wijzigen mag wel', ARRAY[
  $s$UPDATE "BoekBtwAangifte" SET status = 'GOEDGEKEURD', "goedgekeurdOp" = now() WHERE id = 'ba_1'$s$]);
SELECT pg_temp.proef_weigert('h3 aangifte verwijderen (echt)', ARRAY[
  $s$DELETE FROM "BoekBtwAangifte" WHERE id = 'ba_1'$s$], 'wordt niet verwijderd');

-- Overzicht.
\o
\set QUIET off
SELECT volgnr, CASE WHEN ok THEN 'OK' ELSE 'FOUT' END AS uitslag, stap, toelichting FROM proef_uitslag ORDER BY volgnr;
SELECT CASE WHEN bool_and(ok) THEN 'ALLES OK' ELSE 'ER ZIJN FOUTEN' END AS eindoordeel,
       COUNT(*) AS stappen, COUNT(*) FILTER (WHERE NOT ok) AS fouten
  FROM proef_uitslag;

ROLLBACK;
