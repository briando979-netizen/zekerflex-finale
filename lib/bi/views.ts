// ---------------------------------------------------------------------------
// Het schema `bi`: wat Metabase mag zien. Geen enkele echte tabel, alleen
// views met de kolommen die een opdrachtgever over zijn eigen bedrijf mag
// zien (geen wachtwoorden, geen persoonsgegevens van werkers, geen andere
// bedrijven). Elke view heeft tenant_id, zodat een ingebed dashboard op het
// bedrijf vastgezet kan worden. De rol zf_bi mag alleen in dit schema lezen;
// de views draaien met de rechten van hun eigenaar, dus de rol hoeft de
// echte tabellen niet te kunnen lezen. Alles is CREATE OR REPLACE: veilig om
// bij elke inrichting opnieuw te draaien. Bedragen in euro's, tijden in
// Nederlandse tijd.
// ---------------------------------------------------------------------------

export const BI_SCHEMA = "bi";
export const BI_ROL = "zf_bi";

/** De views, in volgorde (latere views mogen op eerdere bouwen). */
export const BI_VIEWS: { naam: string; uitleg: string; sql: string }[] = [
  {
    naam: "diensten",
    uitleg: "Elke geplaatste dienst met vestiging, tijden, geplande uren, tarief en status",
    sql: `
      SELECT s.id,
             b."tenantId"                                             AS tenant_id,
             b.name                                                   AS vestiging,
             b."costCenter"                                           AS kostenplaats,
             s.title                                                  AS titel,
             (s."startsAt" AT TIME ZONE 'Europe/Amsterdam')           AS start,
             (s."endsAt"   AT TIME ZONE 'Europe/Amsterdam')           AS einde,
             date_trunc('day',   s."startsAt" AT TIME ZONE 'Europe/Amsterdam')::date AS datum,
             date_trunc('week',  s."startsAt" AT TIME ZONE 'Europe/Amsterdam')::date AS week,
             date_trunc('month', s."startsAt" AT TIME ZONE 'Europe/Amsterdam')::date AS maand,
             round(((EXTRACT(EPOCH FROM (s."endsAt" - s."startsAt")) / 60 - s."breakMinutes") / 60.0)::numeric, 2) AS uren_per_plaats,
             s.positions                                              AS plaatsen,
             round((s."hourlyRateCents" / 100.0)::numeric, 2)         AS uurtarief_eur,
             s.status::text                                           AS status,
             s."viaUitzendbureau"                                     AS via_uitzendbureau,
             (SELECT count(*) FROM "ShiftAssignment" a WHERE a."shiftId" = s.id AND a."cancelledAt" IS NULL) AS ingevuld
      FROM "Shift" s
      JOIN "Branch" b ON b.id = s."branchId"`,
  },
  {
    naam: "uren",
    uitleg: "Gewerkte en goedgekeurde uren per dienst met de kosten",
    sql: `
      SELECT t.id,
             b."tenantId"                                             AS tenant_id,
             b.name                                                   AS vestiging,
             b."costCenter"                                           AS kostenplaats,
             s.title                                                  AS dienst,
             date_trunc('day',   t."scheduledStart" AT TIME ZONE 'Europe/Amsterdam')::date AS datum,
             date_trunc('week',  t."scheduledStart" AT TIME ZONE 'Europe/Amsterdam')::date AS week,
             date_trunc('month', t."scheduledStart" AT TIME ZONE 'Europe/Amsterdam')::date AS maand,
             round((t."billableMinutes" / 60.0)::numeric, 2)          AS uren,
             round((t."hourlyRateCents" / 100.0)::numeric, 2)         AS uurtarief_eur,
             round((t."billableMinutes" / 60.0 * t."hourlyRateCents" / 100.0)::numeric, 2) AS kosten_eur,
             round((coalesce(t."extraCostsCents", 0) / 100.0)::numeric, 2) AS extra_kosten_eur,
             t.status::text                                           AS status,
             (t."approvedAt" AT TIME ZONE 'Europe/Amsterdam')         AS goedgekeurd_op,
             s."viaUitzendbureau"                                     AS via_uitzendbureau
      FROM "Timesheet" t
      JOIN "Branch" b ON b.id = t."branchId"
      JOIN "ShiftAssignment" a ON a.id = t."assignmentId"
      JOIN "Shift" s ON s.id = a."shiftId"`,
  },
  {
    naam: "facturen",
    uitleg: "Facturen aan het bedrijf: soort, bedragen, uitgereikt, betaald en of ze te laat zijn",
    sql: `
      SELECT i.id,
             i."recipientTenantId"                                    AS tenant_id,
             i.number                                                 AS nummer,
             i.type::text                                             AS soort,
             i.status::text                                           AS status,
             round((i."subtotalCents" / 100.0)::numeric, 2)           AS subtotaal_eur,
             round((i."vatCents" / 100.0)::numeric, 2)                AS btw_eur,
             round((i."totalCents" / 100.0)::numeric, 2)              AS totaal_eur,
             (i."issuedAt" AT TIME ZONE 'Europe/Amsterdam')::date     AS uitgereikt_op,
             (i."paidAt"   AT TIME ZONE 'Europe/Amsterdam')::date     AS betaald_op,
             (i."dueAt"    AT TIME ZONE 'Europe/Amsterdam')::date     AS vervalt_op,
             date_trunc('month', coalesce(i."issuedAt", i."createdAt") AT TIME ZONE 'Europe/Amsterdam')::date AS maand,
             (i.status = 'ISSUED' AND i."dueAt" IS NOT NULL AND i."dueAt" < now()) AS te_laat
      FROM "Invoice" i
      WHERE i."recipientTenantId" IS NOT NULL`,
  },
  {
    naam: "bezetting_per_week",
    uitleg: "Per week: geplande plaatsen, ingevulde plaatsen en de bezettingsgraad",
    sql: `
      SELECT tenant_id, week,
             count(*)                                                 AS diensten,
             sum(plaatsen)                                            AS plaatsen,
             sum(ingevuld)                                            AS ingevuld,
             round((100.0 * sum(ingevuld) / nullif(sum(plaatsen), 0))::numeric, 1) AS bezettingsgraad_pct,
             round(sum(uren_per_plaats * plaatsen)::numeric, 1)       AS uren_gepland
      FROM bi.diensten
      WHERE status <> 'CANCELLED' AND status <> 'DRAFT'
      GROUP BY tenant_id, week`,
  },
  {
    naam: "maandoverzicht",
    uitleg: "Per maand: goedgekeurde uren, loonkosten, platformkosten en openstaande facturen",
    sql: `
      WITH u AS (
        SELECT tenant_id, maand, sum(uren) AS uren, sum(kosten_eur + extra_kosten_eur) AS kosten_eur
        FROM bi.uren WHERE status IN ('APPROVED', 'PAID') GROUP BY tenant_id, maand
      ), f AS (
        SELECT tenant_id, maand,
               sum(totaal_eur) FILTER (WHERE soort = 'PLATFORM_FEE')                       AS platformkosten_eur,
               sum(totaal_eur) FILTER (WHERE status = 'ISSUED')                            AS open_eur,
               sum(totaal_eur) FILTER (WHERE status = 'PAID')                              AS betaald_eur
        FROM bi.facturen WHERE status <> 'CANCELLED' GROUP BY tenant_id, maand
      )
      SELECT coalesce(u.tenant_id, f.tenant_id) AS tenant_id,
             coalesce(u.maand, f.maand)         AS maand,
             coalesce(u.uren, 0)                AS uren,
             coalesce(u.kosten_eur, 0)          AS loonkosten_eur,
             coalesce(f.platformkosten_eur, 0)  AS platformkosten_eur,
             coalesce(f.open_eur, 0)            AS open_eur,
             coalesce(f.betaald_eur, 0)         AS betaald_eur
      FROM u FULL OUTER JOIN f ON f.tenant_id = u.tenant_id AND f.maand = u.maand`,
  },
];

/** De SQL om schema, views en de leesrol in te richten (idempotent). Het wachtwoord staat al veilig ontsnapt. */
export function inrichtSql(rolWachtwoordLiteral: string): string[] {
  return [
    `CREATE SCHEMA IF NOT EXISTS ${BI_SCHEMA}`,
    ...BI_VIEWS.map((v) => `CREATE OR REPLACE VIEW ${BI_SCHEMA}.${v.naam} AS ${v.sql.trim()}`),
    ...BI_VIEWS.map((v) => `COMMENT ON VIEW ${BI_SCHEMA}.${v.naam} IS ${sqlTekst(v.uitleg)}`),
    // de rol: alleen inloggen en lezen in bi; nooit in public
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${BI_ROL}') THEN CREATE ROLE ${BI_ROL} LOGIN PASSWORD ${rolWachtwoordLiteral}; ELSE ALTER ROLE ${BI_ROL} WITH LOGIN PASSWORD ${rolWachtwoordLiteral}; END IF; END $$`,
    `REVOKE ALL ON SCHEMA public FROM ${BI_ROL}`,
    `GRANT USAGE ON SCHEMA ${BI_SCHEMA} TO ${BI_ROL}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA ${BI_SCHEMA} TO ${BI_ROL}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${BI_SCHEMA} GRANT SELECT ON TABLES TO ${BI_ROL}`,
    `ALTER ROLE ${BI_ROL} SET statement_timeout = '30s'`,
  ];
}

/** Een tekst als SQL-literal (enkele aanhalingstekens verdubbeld). */
export const sqlTekst = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Alleen hexadecimaal: veilig om in SQL te zetten en voor Metabase bruikbaar als wachtwoord. */
export const isHexWachtwoord = (s: string) => /^[0-9a-f]{32,128}$/i.test(s);
