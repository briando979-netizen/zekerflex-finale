// ---------------------------------------------------------------------------
// De rapporten die ZekerFlex in Metabase aanmaakt voor opdrachtgevers: elk
// een stuk SQL op het schema bi (lib/bi/views.ts) met {{tenant_id}} als
// vastgezette parameter, zodat een bedrijf alleen zichzelf ziet. Puur: de
// inrichting (lib/bi/metabase.ts) zet ze om in kaarten en één dashboard.
// ---------------------------------------------------------------------------

export type Weergave = "line" | "bar" | "row" | "table" | "scalar" | "area";

export interface Kaart {
  /** vaste sleutel, ook de naam in Metabase (bewaard in KV om bij te werken) */
  sleutel: string;
  naam: string;
  uitleg: string;
  weergave: Weergave;
  sql: string;
  /** plek op het dashboard (raster van 24 kolommen) */
  rij: number;
  kolom: number;
  breedte: number;
  hoogte: number;
  /** extra weergave-instellingen van Metabase (bv. kolom-titels) */
  instellingen?: Record<string, unknown>;
}

export const DASHBOARD_NAAM = "Mijn bedrijf";

export const KAARTEN: Kaart[] = [
  {
    sleutel: "kern",
    naam: "Uren deze maand",
    uitleg: "Goedgekeurde uren in de lopende maand",
    weergave: "scalar",
    sql: `SELECT coalesce(round(sum(uren)::numeric, 1), 0) AS uren
          FROM bi.uren
          WHERE tenant_id = {{tenant_id}} AND status IN ('APPROVED', 'PAID')
            AND maand = date_trunc('month', (now() AT TIME ZONE 'Europe/Amsterdam'))::date`,
    rij: 0,
    kolom: 0,
    breedte: 6,
    hoogte: 4,
    instellingen: { "scalar.suffix": " uur" },
  },
  {
    sleutel: "kosten-maand",
    naam: "Loonkosten deze maand",
    uitleg: "Goedgekeurde uren × tarief, plus extra kosten",
    weergave: "scalar",
    sql: `SELECT coalesce(round(sum(kosten_eur + extra_kosten_eur)::numeric, 2), 0) AS bedrag
          FROM bi.uren
          WHERE tenant_id = {{tenant_id}} AND status IN ('APPROVED', 'PAID')
            AND maand = date_trunc('month', (now() AT TIME ZONE 'Europe/Amsterdam'))::date`,
    rij: 0,
    kolom: 6,
    breedte: 6,
    hoogte: 4,
    instellingen: { "scalar.prefix": "€ " },
  },
  {
    sleutel: "open-facturen",
    naam: "Open facturen",
    uitleg: "Uitgereikt en nog niet betaald",
    weergave: "scalar",
    sql: `SELECT coalesce(round(sum(totaal_eur)::numeric, 2), 0) AS bedrag
          FROM bi.facturen WHERE tenant_id = {{tenant_id}} AND status = 'ISSUED'`,
    rij: 0,
    kolom: 12,
    breedte: 6,
    hoogte: 4,
    instellingen: { "scalar.prefix": "€ " },
  },
  {
    sleutel: "bezetting",
    naam: "Bezettingsgraad deze week",
    uitleg: "Ingevulde plaatsen gedeeld door geplande plaatsen",
    weergave: "scalar",
    sql: `SELECT coalesce(bezettingsgraad_pct, 0) AS pct
          FROM bi.bezetting_per_week
          WHERE tenant_id = {{tenant_id}} AND week = date_trunc('week', (now() AT TIME ZONE 'Europe/Amsterdam'))::date`,
    rij: 0,
    kolom: 18,
    breedte: 6,
    hoogte: 4,
    instellingen: { "scalar.suffix": " %" },
  },
  {
    sleutel: "uren-per-maand",
    naam: "Uren per maand",
    uitleg: "Goedgekeurde uren, de laatste 12 maanden",
    weergave: "bar",
    sql: `SELECT to_char(maand, 'YYYY-MM') AS maand, round(sum(uren)::numeric, 1) AS uren
          FROM bi.uren
          WHERE tenant_id = {{tenant_id}} AND status IN ('APPROVED', 'PAID') AND maand >= (date_trunc('month', now()) - interval '11 months')::date
          GROUP BY 1 ORDER BY 1`,
    rij: 4,
    kolom: 0,
    breedte: 12,
    hoogte: 7,
    instellingen: { "graph.dimensions": ["maand"], "graph.metrics": ["uren"] },
  },
  {
    sleutel: "kosten-per-maand",
    naam: "Loonkosten en platformkosten per maand",
    uitleg: "Wat het personeel kostte en wat ZekerFlex rekende",
    weergave: "line",
    sql: `SELECT to_char(maand, 'YYYY-MM') AS maand, round(loonkosten_eur::numeric, 2) AS loonkosten, round(platformkosten_eur::numeric, 2) AS platformkosten
          FROM bi.maandoverzicht
          WHERE tenant_id = {{tenant_id}} AND maand >= (date_trunc('month', now()) - interval '11 months')::date
          ORDER BY maand`,
    rij: 4,
    kolom: 12,
    breedte: 12,
    hoogte: 7,
    instellingen: { "graph.dimensions": ["maand"], "graph.metrics": ["loonkosten", "platformkosten"] },
  },
  {
    sleutel: "kosten-per-vestiging",
    naam: "Kosten per vestiging (90 dagen)",
    uitleg: "Waar de uren gemaakt werden",
    weergave: "row",
    sql: `SELECT vestiging, round(sum(kosten_eur + extra_kosten_eur)::numeric, 2) AS bedrag
          FROM bi.uren
          WHERE tenant_id = {{tenant_id}} AND status IN ('APPROVED', 'PAID') AND datum >= (now() - interval '90 days')::date
          GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
    rij: 11,
    kolom: 0,
    breedte: 12,
    hoogte: 7,
    instellingen: { "graph.dimensions": ["vestiging"], "graph.metrics": ["bedrag"] },
  },
  {
    sleutel: "bezetting-per-week",
    naam: "Bezettingsgraad per week",
    uitleg: "Ingevulde plaatsen als percentage, de laatste 16 weken",
    weergave: "line",
    sql: `SELECT to_char(week, 'IYYY-"w"IW') AS week, bezettingsgraad_pct AS bezetting
          FROM bi.bezetting_per_week
          WHERE tenant_id = {{tenant_id}} AND week >= (date_trunc('week', now()) - interval '15 weeks')::date
          ORDER BY bi.bezetting_per_week.week`,
    rij: 11,
    kolom: 12,
    breedte: 12,
    hoogte: 7,
    instellingen: { "graph.dimensions": ["week"], "graph.metrics": ["bezetting"] },
  },
  {
    sleutel: "facturen",
    naam: "Facturen",
    uitleg: "De laatste 50 facturen",
    weergave: "table",
    sql: `SELECT nummer, soort, status, totaal_eur AS "totaal (€)", uitgereikt_op, vervalt_op, betaald_op, te_laat
          FROM bi.facturen WHERE tenant_id = {{tenant_id}} ORDER BY uitgereikt_op DESC NULLS LAST LIMIT 50`,
    rij: 18,
    kolom: 0,
    breedte: 24,
    hoogte: 8,
  },
];
