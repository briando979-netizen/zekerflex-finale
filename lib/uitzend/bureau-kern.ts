// ---------------------------------------------------------------------------
// Het dashboard van een uitzendpartner (21 nov 2026, eigenaar: "bouw van 1 tot 5"): aanvragen, uitzendkrachten,
// uren voor de verloning, klanten en locaties, bureaugegevens. Hier de pure rekenregels; de gegevens haalt
// lib/uitzend/bureau.ts op. Puur bestand (geen prisma of kv), ook in de browser bruikbaar.
// ---------------------------------------------------------------------------
import type { OfferStatus } from "@/lib/offers/store";
import { amsterdamDayKey, amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { PARTNER_VOORWAARDEN_VERSIE, TERMIJN } from "@/lib/uitzend/voorwaarden";

const DAG_MS = 864e5;

// --- aanvragen ------------------------------------------------------------------

/** Waar een aanvraag voor een uitzendcontract staat, gezien vanuit het bureau. */
/** De labels per stap staan in het werkgeverswoordenboek (uitzendBureau.stap in lib/i18n/dictionaries.ts). */
export type AanvraagStap = "nieuw" | "gebeld" | "ingepland" | "afgewezen" | "ingetrokken" | "verlopen";

/** De stap uit de status van de reactie (lib/offers/store.ts) en of het bureau al belde. */
export function stapVan(status: OfferStatus, gebeldOp: string | null | undefined): AanvraagStap {
  switch (status) {
    case "accepted":
      return "ingepland";
    case "declined":
      return "afgewezen";
    case "withdrawn":
      return "ingetrokken";
    case "expired":
      return "verlopen";
    default:
      return gebeldOp ? "gebeld" : "nieuw";
  }
}

/** Een aanvraag die nog een antwoord van het bureau vraagt. */
export const isOpen = (stap: AanvraagStap): boolean => stap === "nieuw" || stap === "gebeld";

/**
 * Werkdagen (maandag tot en met vrijdag, Nederlandse kalender, zonder feestdagen) ná de dag van `van`, tot en met
 * de dag van `nu`. Een aanvraag van maandag telt dinsdag 1, woensdag 2.
 */
export function werkdagenSinds(van: Date, nu: Date): number {
  const a = amsterdamParts(van);
  const b = amsterdamParts(nu);
  const eind = Date.UTC(b.year, b.month - 1, b.day);
  let n = 0;
  for (let d = Date.UTC(a.year, a.month - 1, a.day + 1); d <= eind && n < 10_000; d += DAG_MS) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}

/** Wacht een nieuwe aanvraag langer dan de reactietermijn uit de partnervoorwaarden? (Gebeld telt als gereageerd.) */
export function isTeLaat(stap: AanvraagStap, aangevraagd: Date, nu: Date): boolean {
  return stap === "nieuw" && werkdagenSinds(aangevraagd, nu) > TERMIJN.reactieWerkdagen;
}

/** Open aanvragen eerst (de oudste bovenaan: die wacht het langst), daarna de rest, nieuwste eerst. */
export function sorteerAanvragen<T extends { stap: AanvraagStap; at: string }>(rijen: readonly T[]): T[] {
  return [...rijen].sort((x, y) => {
    const ox = isOpen(x.stap) ? 0 : 1;
    const oy = isOpen(y.stap) ? 0 : 1;
    if (ox !== oy) return ox - oy;
    return ox === 0 ? (x.at < y.at ? -1 : 1) : x.at < y.at ? 1 : -1;
  });
}

// --- weken voor de verloning ------------------------------------------------------

/** ISO-week (maandag t/m zondag) van een moment, in Nederlandse tijd: "2026-W47". */
export function weekVan(d: Date): string {
  const p = amsterdamParts(d);
  const dag = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() || 7;
  const donderdag = new Date(Date.UTC(p.year, p.month - 1, p.day + 4 - dag));
  const jaar = donderdag.getUTCFullYear();
  const week = Math.ceil(((donderdag.getTime() - Date.UTC(jaar, 0, 1)) / DAG_MS + 1) / 7);
  return `${jaar}-W${String(week).padStart(2, "0")}`;
}

/** Begin (maandag 00:00) en eind (de maandag erna, 00:00) van een ISO-week in Nederlandse tijd; null bij een onzinnige week. */
export function weekGrenzen(sleutel: string): { van: Date; tot: Date } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(sleutel);
  if (!m) return null;
  const jaar = Number(m[1]);
  const week = Number(m[2]);
  if (jaar < 2020 || jaar > 2100 || week < 1 || week > 53) return null;
  const vierJan = new Date(Date.UTC(jaar, 0, 4)).getUTCDay() || 7;
  const maandag = new Date(Date.UTC(jaar, 0, 4 - (vierJan - 1) + (week - 1) * 7));
  // week 53 bestaat niet elk jaar: dan valt hij in week 1 van het volgende jaar
  if (weekVan(new Date(maandag.getTime() + 12 * 3600e3)) !== sleutel) return null;
  const y = maandag.getUTCFullYear();
  const mo = maandag.getUTCMonth() + 1;
  const dd = maandag.getUTCDate();
  return { van: amsterdamToUtc(y, mo, dd), tot: amsterdamToUtc(y, mo, dd + 7) };
}

/** De laatste `aantal` weken, de huidige eerst. */
export function recenteWeken(nu: Date, aantal = 8): string[] {
  const p = amsterdamParts(nu);
  const uit: string[] = [];
  for (let i = 0; i < aantal; i += 1) uit.push(weekVan(amsterdamToUtc(p.year, p.month, p.day - i * 7, 12)));
  return uit;
}

/** "17 nov – 23 nov 2026" bij een week; `intl` volgt de taal van de werkgeversapp (uitzendBureau.intl). */
export function weekTekst(sleutel: string, intl = "nl-NL"): string {
  const g = weekGrenzen(sleutel);
  if (!g) return sleutel;
  const opmaak = (d: Date, metJaar: boolean) =>
    d.toLocaleDateString(intl, { day: "numeric", month: "short", ...(metJaar ? { year: "numeric" } : {}), timeZone: "Europe/Amsterdam" });
  return `${opmaak(g.van, false)} – ${opmaak(new Date(g.tot.getTime() - 3600e3), true)}`;
}

// --- uren voor de verloning -------------------------------------------------------

export interface VerloningDienst {
  werkerId: string;
  naam: string;
  email: string;
  locatie: string;
  klus: string;
  begin: Date;
  eind: Date;
  pauzeMinuten: number;
  minuten: number;
  uurloonCents: number;
}

export interface VerloningTotaal {
  werkerId: string;
  naam: string;
  email: string;
  diensten: number;
  minuten: number;
  brutoCents: number;
  locaties: string[];
}

/** Bruto loon van één dienst: uren × uurloon volgens de klus, afgerond op centen. */
export const brutoVan = (d: Pick<VerloningDienst, "minuten" | "uurloonCents">): number => Math.round((d.minuten / 60) * d.uurloonCents);

/** De diensten opgeteld per uitzendkracht, op naam. */
export function totalenPerWerker(diensten: readonly VerloningDienst[]): VerloningTotaal[] {
  const per = new Map<string, VerloningTotaal>();
  for (const d of diensten) {
    const t = per.get(d.werkerId) ?? { werkerId: d.werkerId, naam: d.naam, email: d.email, diensten: 0, minuten: 0, brutoCents: 0, locaties: [] };
    t.diensten += 1;
    t.minuten += d.minuten;
    t.brutoCents += brutoVan(d);
    if (!t.locaties.includes(d.locatie)) t.locaties.push(d.locatie);
    per.set(d.werkerId, t);
  }
  return [...per.values()].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

const csvCel = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  // geen formules in Excel (=, +, -, @ aan het begin)
  const veilig = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(veilig) ? `"${veilig.replace(/"/g, '""')}"` : veilig;
};
const komma = (n: number) => n.toFixed(2).replace(".", ",");
const datum = (d: Date) => d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Amsterdam" });
const tijd = (d: Date) => d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

/** Eén regel per dienst, met puntkomma en BOM: opent goed in Nederlandse Excel en in de meeste loonpakketten. */
export function verloningCsv(week: string, diensten: readonly VerloningDienst[]): string {
  const rijen: unknown[][] = [
    ["Week", "Datum", "Uitzendkracht", "E-mail", "Klant of locatie", "Klus", "Begin", "Eind", "Pauze (min)", "Uren", "Uurloon volgens klus (EUR)", "Bruto (EUR)"],
    ...[...diensten]
      .sort((a, b) => a.naam.localeCompare(b.naam, "nl") || a.begin.getTime() - b.begin.getTime())
      .map((d) => [week, datum(d.begin), d.naam, d.email, d.locatie, d.klus, tijd(d.begin), tijd(d.eind), d.pauzeMinuten, komma(d.minuten / 60), komma(d.uurloonCents / 100), komma(brutoVan(d) / 100)]),
  ];
  return "﻿" + rijen.map((r) => r.map(csvCel).join(";")).join("\r\n") + "\r\n";
}

// --- bureaugegevens -------------------------------------------------------------

export type Keurmerk = "sna" | "wtta" | "geen";
export type Cao = "abu" | "nbbu" | "anders" | "";

/** Wat het bureau over zichzelf vastlegt (artikel 3 van de partnervoorwaarden). Bedrijfsgegevens, geen persoon. */
export interface BureauGegevens {
  /** ingeschreven in het Handelsregister met de registratie als uitlener */
  uitlener: boolean;
  keurmerk: Keurmerk;
  /** het SNA-certificaat of de Wtta-toelating geldt tot (JJJJ-MM-DD) */
  keurmerkTot: string | null;
  cao: Cao;
  /** de bedrijfsaansprakelijkheidsverzekering loopt tot (JJJJ-MM-DD) */
  verzekeringTot: string | null;
  /** loonheffingennummer van het bureau (bedrijfsnummer) */
  loonheffingennummer: string;
  /** akkoord op de partnervoorwaarden: welke versie, wanneer, door welk account */
  akkoord: { versie: string; op: string; door: string } | null;
  bijgewerkt: string | null;
}

export const LEGE_GEGEVENS: BureauGegevens = {
  uitlener: false,
  keurmerk: "geen",
  keurmerkTot: null,
  cao: "",
  verzekeringTot: null,
  loonheffingennummer: "",
  akkoord: null,
  bijgewerkt: null,
};

const isDatum = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const tekstOf = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Bewaarde gegevens soepel inlezen: wat niet klopt, valt terug op leeg. */
export function leesBureauGegevens(json: unknown): BureauGegevens {
  if (!json || typeof json !== "object") return LEGE_GEGEVENS;
  const o = json as Record<string, unknown>;
  const a = o.akkoord as Record<string, unknown> | null | undefined;
  return {
    uitlener: o.uitlener === true,
    keurmerk: o.keurmerk === "sna" || o.keurmerk === "wtta" ? o.keurmerk : "geen",
    keurmerkTot: isDatum(o.keurmerkTot) ? o.keurmerkTot : null,
    cao: o.cao === "abu" || o.cao === "nbbu" || o.cao === "anders" ? o.cao : "",
    verzekeringTot: isDatum(o.verzekeringTot) ? o.verzekeringTot : null,
    loonheffingennummer: tekstOf(o.loonheffingennummer, 20),
    akkoord:
      a && typeof a === "object" && typeof a.versie === "string" && typeof a.op === "string" && typeof a.door === "string"
        ? { versie: a.versie, op: a.op, door: a.door }
        : null,
    bijgewerkt: typeof o.bijgewerkt === "string" ? o.bijgewerkt : null,
  };
}

/** Dagen van vandaag (Nederlandse kalender) tot een datum JJJJ-MM-DD; negatief = verlopen. */
export function dagenTot(datumTekst: string, nu: Date): number {
  const [y, m, d] = datumTekst.split("-").map(Number);
  const [ny, nm, nd] = amsterdamDayKey(nu).split("-").map(Number);
  return Math.round((Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) - Date.UTC(ny ?? 0, (nm ?? 1) - 1, nd ?? 1)) / DAG_MS);
}

/** Zo lang van tevoren waarschuwt het dashboard dat iets verloopt. */
export const WAARSCHUW_DAGEN = 30;

export interface BureauMelding {
  ernst: "warn" | "crit";
  tekst: string;
}

const lang = (datumTekst: string) =>
  new Date(`${datumTekst}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

/** Wat het bureau nog moet regelen of binnenkort moet vernieuwen, het ernstigste eerst. */
export function bureauMeldingen(g: BureauGegevens, nu: Date): BureauMelding[] {
  const uit: BureauMelding[] = [];
  if (!g.akkoord) uit.push({ ernst: "crit", tekst: "Je bureau heeft de partnervoorwaarden nog niet geaccepteerd." });
  else if (g.akkoord.versie !== PARTNER_VOORWAARDEN_VERSIE) uit.push({ ernst: "crit", tekst: `Er is een nieuwe versie van de partnervoorwaarden (${PARTNER_VOORWAARDEN_VERSIE}). Lees en accepteer die opnieuw.` });
  if (!g.uitlener) uit.push({ ernst: "crit", tekst: "Bevestig dat je bureau in het Handelsregister staat met de registratie als uitlener." });
  if (g.keurmerk === "geen") uit.push({ ernst: "crit", tekst: "Vul je SNA-keurmerk of je Wtta-toelating in." });
  const verloop = (wat: string, datumTekst: string | null) => {
    if (!datumTekst) {
      uit.push({ ernst: "warn", tekst: `Vul in tot wanneer ${wat} geldt.` });
      return;
    }
    const n = dagenTot(datumTekst, nu);
    if (n < 0) uit.push({ ernst: "crit", tekst: `${wat[0]?.toUpperCase() ?? ""}${wat.slice(1)} is verlopen op ${lang(datumTekst)}. Vernieuw het en vul de nieuwe datum in.` });
    else if (n <= WAARSCHUW_DAGEN) uit.push({ ernst: "warn", tekst: `${wat[0]?.toUpperCase() ?? ""}${wat.slice(1)} verloopt over ${n} ${n === 1 ? "dag" : "dagen"} (${lang(datumTekst)}).` });
  };
  if (g.keurmerk !== "geen") verloop(g.keurmerk === "sna" ? "je SNA-keurmerk" : "je Wtta-toelating", g.keurmerkTot);
  verloop("je aansprakelijkheidsverzekering", g.verzekeringTot);
  if (!g.cao) uit.push({ ernst: "warn", tekst: "Kies welke cao je bureau volgt." });
  return uit.sort((a, b) => (a.ernst === b.ernst ? 0 : a.ernst === "crit" ? -1 : 1));
}
