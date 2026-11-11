// ---------------------------------------------------------------------------
// Werkbonnen en opdrachten voor bouw, installatie en schoonmaak (11 nov 2026, branchemotor).
// Dit is het zuivere deel, zonder opslag: wat een werkbon is, welke statuswisselingen mogen, de totalen
// (uren en materiaal) en de controle van wat een bedrijf invult, met gewone Nederlandse fouten.
// Planning is Nederlandse klokkentijd (lib/time/amsterdam) en wordt als UTC (ISO met Z) bewaard: de server
// draait in UTC, dus "09:00" is altijd een wandkloktijd in Amsterdam, ook rond de zomer- en wintertijd.
// Er is bewust GEEN koppeling met uren goedkeuren of facturen: een werkbon is een eigen overzicht van het bedrijf.
// ---------------------------------------------------------------------------

import { parseAmsterdamLocal } from "@/lib/time/amsterdam";

export const STATUSSEN = ["nieuw", "ingepland", "bezig", "afgerond", "geannuleerd"] as const;
export type WerkbonStatus = (typeof STATUSSEN)[number];

export const STATUS_NAAM: Record<WerkbonStatus, string> = {
  nieuw: "Nieuw",
  ingepland: "Ingepland",
  bezig: "Bezig",
  afgerond: "Afgerond",
  geannuleerd: "Geannuleerd",
};
export const isStatus = (s: unknown): s is WerkbonStatus => typeof s === "string" && Object.hasOwn(STATUS_NAAM, s);

/** Welke statuswisselingen mogen. Afgerond kan terug naar bezig (er bleek nog werk), geannuleerd terug naar nieuw. */
export const OVERGANGEN: Record<WerkbonStatus, readonly WerkbonStatus[]> = {
  nieuw: ["ingepland", "bezig", "afgerond", "geannuleerd"],
  ingepland: ["nieuw", "bezig", "afgerond", "geannuleerd"],
  bezig: ["ingepland", "afgerond", "geannuleerd"],
  afgerond: ["bezig"],
  geannuleerd: ["nieuw"],
};

export const MAX_UREN = 200;
export const MAX_MATERIALEN = 200;
export const MAX_MEDEWERKERS = 20;
export const MAX_TEAM = 50;

export interface WerkbonKlant {
  naam: string;
  telefoon: string;
  email: string;
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
}

export interface Urenregel {
  id: string;
  medewerker: string;
  /** YYYY-MM-DD (Nederlandse dag) */
  datum: string;
  minuten: number;
  opmerking: string;
}

export interface Materiaalregel {
  id: string;
  omschrijving: string;
  aantal: number;
  /** centen per stuk; null = (nog) geen prijs */
  prijsCent: number | null;
}

/** Wat een bedrijf zelf invult (alles behalve nummer, status en tijdstippen). */
export interface WerkbonInhoud {
  klant: WerkbonKlant;
  omschrijving: string;
  /** ISO met Z, of null (nog niet gepland) */
  start: string | null;
  eind: string | null;
  medewerkers: string[];
  uren: Urenregel[];
  materialen: Materiaalregel[];
  interneNotitie: string;
  afrondNotitie: string;
}

export interface Werkbon extends WerkbonInhoud {
  /** "2026-0001": jaar en volgnummer; ook de sleutel in de opslag */
  id: string;
  /** "WB-2026-0001" */
  nummer: string;
  status: WerkbonStatus;
  afgerondOp: string | null;
  gemaaktOp: string;
  bijgewerktOp: string;
}

export const WERKBON_ID = /^\d{4}-\d{4,6}$/;
export const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export const leegeKlant = (): WerkbonKlant => ({ naam: "", telefoon: "", email: "", straat: "", huisnummer: "", postcode: "", plaats: "" });

// --- schoonmaken -----------------------------------------------------------------

/** Spaties samenvoegen en stuurtekens weghalen. */
export function schoneTekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Een notitie mag regels hebben: alleen stuurtekens (behalve een nieuwe regel) en lege regels aan de randen weg. */
export function schoneNotitie(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

export type Gecontroleerd<T> = { ok: true; waarde: T } | { ok: false; fout: string; code?: string };

const geldigeDatum = (s: string): boolean => {
  if (!DATUM.test(s)) return false;
  const j = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const t = new Date(Date.UTC(j, m - 1, d));
  return j >= 2000 && j <= 2100 && t.getUTCFullYear() === j && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** Een planningsveld: leeg → null, "2026-11-12T08:00" is Nederlandse tijd, een tekst met zone ("…Z") wordt zo gelezen. */
function leesTijd(v: unknown): Date | null | "fout" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return "fout";
  const t = parseAmsterdamLocal(v.trim());
  const jaar = t.getUTCFullYear();
  return Number.isNaN(t.getTime()) || jaar < 2000 || jaar > 2100 ? "fout" : t;
}

/** De duur van de planning in minuten (de echte tijd tussen begin en einde, ook over de zomertijd heen). */
export function planningDuurMin(start: string | null, eind: string | null): number | null {
  if (!start || !eind) return null;
  return Math.round((new Date(eind).getTime() - new Date(start).getTime()) / 60_000);
}

/** Controleert wat een bedrijf invult voor een werkbon. `nieuwId` geeft een vers id voor een regel zonder (geldig) id. */
export function controleerInvoer(invoer: unknown, nieuwId: () => string): Gecontroleerd<WerkbonInhoud> {
  const o = (invoer && typeof invoer === "object" ? invoer : {}) as Record<string, unknown>;
  const k = (o.klant && typeof o.klant === "object" ? o.klant : {}) as Record<string, unknown>;

  const klant: WerkbonKlant = {
    naam: schoneTekst(k.naam, 80),
    telefoon: schoneTekst(k.telefoon, 25),
    email: schoneTekst(k.email, 120).toLowerCase(),
    straat: schoneTekst(k.straat, 80),
    huisnummer: schoneTekst(k.huisnummer, 12),
    postcode: schoneTekst(k.postcode, 10).toUpperCase(),
    plaats: schoneTekst(k.plaats, 60),
  };
  if (klant.telefoon && !/^[0-9+()\-\s.]{6,25}$/.test(klant.telefoon)) return { ok: false, fout: "Dit telefoonnummer klopt niet. Gebruik alleen cijfers, spaties, + en -." };
  if (klant.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(klant.email)) return { ok: false, fout: "Dit e-mailadres klopt niet." };
  if (klant.postcode && !/^[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$/.test(klant.postcode)) return { ok: false, fout: "Deze postcode klopt niet. Een voorbeeld: 1234 AB." };

  const omschrijving = schoneNotitie(o.omschrijving, 2_000);
  if (omschrijving.length < 2) return { ok: false, fout: "Vul een omschrijving van het werk in." };

  const start = leesTijd(o.start);
  const eind = leesTijd(o.eind);
  if (start === "fout") return { ok: false, fout: "Kies een geldige begintijd." };
  if (eind === "fout") return { ok: false, fout: "Kies een geldige eindtijd." };
  if (eind && !start) return { ok: false, fout: "Vul ook een begintijd in als je een eindtijd opgeeft." };
  if (start && eind && eind.getTime() <= start.getTime()) return { ok: false, fout: "Het einde ligt voor het begin. Kies een eindtijd na de begintijd." };

  const medewerkersRuw = Array.isArray(o.medewerkers) ? o.medewerkers : [];
  const medewerkers = [...new Set(medewerkersRuw.map((m) => schoneTekst(m, 60)).filter(Boolean))];
  if (medewerkers.length > MAX_MEDEWERKERS) return { ok: false, fout: `Je kunt hooguit ${MAX_MEDEWERKERS} medewerkers aan een werkbon geven.` };

  const ids = new Set<string>();
  const uniek = (id: unknown): string => {
    const schoon = typeof id === "string" && /^[a-z0-9]{4,16}$/.test(id) && !ids.has(id) ? id : nieuwId();
    ids.add(schoon);
    return schoon;
  };

  const urenRuw = Array.isArray(o.uren) ? o.uren : [];
  if (urenRuw.length > MAX_UREN) return { ok: false, fout: `Je kunt hooguit ${MAX_UREN} urenregels op een werkbon zetten.` };
  const uren: Urenregel[] = [];
  for (const [n, ruw] of urenRuw.entries()) {
    const r = (ruw && typeof ruw === "object" ? ruw : {}) as Record<string, unknown>;
    const regel = `Urenregel ${n + 1}`;
    const medewerker = schoneTekst(r.medewerker, 60);
    if (!medewerker) return { ok: false, fout: `${regel}: kies een medewerker.` };
    const datum = typeof r.datum === "string" ? r.datum.trim() : "";
    if (!geldigeDatum(datum)) return { ok: false, fout: `${regel}: kies een geldige datum.` };
    const minuten = typeof r.minuten === "number" ? r.minuten : Number.NaN;
    if (!Number.isInteger(minuten) || minuten < 1 || minuten > 1_440) return { ok: false, fout: `${regel}: vul het aantal minuten in (1 tot 1440).` };
    uren.push({ id: uniek(r.id), medewerker, datum, minuten, opmerking: schoneTekst(r.opmerking, 200) });
  }

  const matRuw = Array.isArray(o.materialen) ? o.materialen : [];
  if (matRuw.length > MAX_MATERIALEN) return { ok: false, fout: `Je kunt hooguit ${MAX_MATERIALEN} materiaalregels op een werkbon zetten.` };
  const materialen: Materiaalregel[] = [];
  for (const [n, ruw] of matRuw.entries()) {
    const r = (ruw && typeof ruw === "object" ? ruw : {}) as Record<string, unknown>;
    const regel = `Materiaalregel ${n + 1}`;
    const omsch = schoneTekst(r.omschrijving, 120);
    if (!omsch) return { ok: false, fout: `${regel}: vul een omschrijving in.` };
    const aantal = typeof r.aantal === "number" ? r.aantal : Number.NaN;
    if (!Number.isFinite(aantal) || aantal <= 0 || aantal > 100_000 || Math.abs(aantal * 100 - Math.round(aantal * 100)) > 1e-6) return { ok: false, fout: `${regel}: vul een aantal in groter dan 0, met hooguit 2 decimalen.` };
    let prijsCent: number | null = null;
    if (r.prijsCent !== null && r.prijsCent !== undefined && r.prijsCent !== "") {
      if (typeof r.prijsCent !== "number" || !Number.isInteger(r.prijsCent) || r.prijsCent < 0 || r.prijsCent > 100_000_000) return { ok: false, fout: `${regel}: de prijs per stuk klopt niet.` };
      prijsCent = r.prijsCent;
    }
    materialen.push({ id: uniek(r.id), omschrijving: omsch, aantal: Math.round(aantal * 100) / 100, prijsCent });
  }

  return {
    ok: true,
    waarde: {
      klant,
      omschrijving,
      start: start ? start.toISOString() : null,
      eind: eind ? eind.toISOString() : null,
      medewerkers,
      uren,
      materialen,
      interneNotitie: schoneNotitie(o.interneNotitie, 2_000),
      afrondNotitie: schoneNotitie(o.afrondNotitie, 2_000),
    },
  };
}

/** De lijst met namen van medewerkers die een bedrijf zelf beheert (vrije namen, geen accounts). */
export function controleerTeam(invoer: unknown): Gecontroleerd<string[]> {
  const o = (invoer && typeof invoer === "object" ? invoer : {}) as Record<string, unknown>;
  const ruw = Array.isArray(o.namen) ? o.namen : null;
  if (!ruw) return { ok: false, fout: "Geef de namen van je medewerkers op." };
  const namen = [...new Set(ruw.map((n) => schoneTekst(n, 60)).filter(Boolean))];
  if (namen.length > MAX_TEAM) return { ok: false, fout: `Je kunt hooguit ${MAX_TEAM} medewerkers in de lijst zetten.` };
  return { ok: true, waarde: namen };
}

// --- totalen ---------------------------------------------------------------------

export interface Totalen {
  minuten: number;
  /** minuten / 60, 2 decimalen */
  uren: number;
  materiaalCent: number;
  /** materiaalregels zonder prijs: die tellen niet mee in materiaalCent */
  regelsZonderPrijs: number;
  urenRegels: number;
  materiaalRegels: number;
}

export function totalen(b: Pick<WerkbonInhoud, "uren" | "materialen">): Totalen {
  const minuten = b.uren.reduce((som, r) => som + r.minuten, 0);
  let materiaalCent = 0;
  let regelsZonderPrijs = 0;
  for (const m of b.materialen) {
    if (m.prijsCent === null) regelsZonderPrijs += 1;
    else materiaalCent += Math.round(m.aantal * m.prijsCent);
  }
  return { minuten, uren: Math.round((minuten / 60) * 100) / 100, materiaalCent, regelsZonderPrijs, urenRegels: b.uren.length, materiaalRegels: b.materialen.length };
}

export const regelTotaalCent = (m: Materiaalregel): number | null => (m.prijsCent === null ? null : Math.round(m.aantal * m.prijsCent));

// --- statuswisseling -------------------------------------------------------------

/**
 * Zet een werkbon op een andere status, als dat mag. Afronden kan niet zonder minstens één urenregel of materiaal, tenzij
 * `zonderUren` expliciet waar is (code ZONDER_UREN, zodat het scherm kan vragen of het echt zo is). Afgerond bewaart het
 * tijdstip; terug naar bezig wist het.
 */
export function wisselStatus(b: Werkbon, naar: WerkbonStatus, opties: { zonderUren?: boolean; nu: Date }): Gecontroleerd<Werkbon> {
  if (naar === b.status) return { ok: true, waarde: b };
  if (!OVERGANGEN[b.status].includes(naar)) {
    return { ok: false, fout: `Een werkbon die "${STATUS_NAAM[b.status].toLowerCase()}" is, kan niet naar "${STATUS_NAAM[naar].toLowerCase()}". Mogelijk: ${OVERGANGEN[b.status].map((s) => STATUS_NAAM[s].toLowerCase()).join(", ")}.` };
  }
  if (naar === "afgerond" && b.uren.length + b.materialen.length === 0 && opties.zonderUren !== true) {
    return { ok: false, code: "ZONDER_UREN", fout: "Er staan nog geen uren of materialen op deze werkbon. Voeg ze toe, of bevestig dat je hem zonder afrondt." };
  }
  const nu = opties.nu.toISOString();
  return { ok: true, waarde: { ...b, status: naar, afgerondOp: naar === "afgerond" ? nu : null, bijgewerktOp: nu } };
}

/** Mag een werkbon verwijderd worden? Alleen als hij nog niets voorstelt (nieuw) of niet doorgaat (geannuleerd). */
export const magVerwijderen = (b: Pick<Werkbon, "status">): boolean => b.status === "nieuw" || b.status === "geannuleerd";

/** Klantgegevens wissen (recht op vergetelheid): naam, telefoon, e-mail en adres leeg; de rest van de bon blijft. */
export function wisKlantgegevens(b: Werkbon, nu: Date): Werkbon {
  return { ...b, klant: leegeKlant(), bijgewerktOp: nu.toISOString() };
}

// --- zoeken en tonen -------------------------------------------------------------

export interface WerkbonRegel {
  id: string;
  nummer: string;
  status: WerkbonStatus;
  klantNaam: string;
  adres: string;
  omschrijving: string;
  start: string | null;
  totalen: Totalen;
}

/** "Hoofdstraat 12, 1234 AB Utrecht", zonder de delen die leeg zijn. */
export function adresRegel(k: WerkbonKlant): string {
  const straat = [k.straat, k.huisnummer].filter(Boolean).join(" ");
  const plaats = [k.postcode, k.plaats].filter(Boolean).join(" ");
  return [straat, plaats].filter(Boolean).join(", ");
}

export const regelVan = (b: Werkbon): WerkbonRegel => ({
  id: b.id,
  nummer: b.nummer,
  status: b.status,
  klantNaam: b.klant.naam,
  adres: adresRegel(b.klant),
  omschrijving: b.omschrijving,
  start: b.start,
  totalen: totalen(b),
});

/** Filter op status en zoekterm (nummer, klant, adres, omschrijving); de nieuwste eerst. */
export function filterBonnen(bonnen: Werkbon[], opties: { status?: WerkbonStatus | undefined; q?: string | undefined }): Werkbon[] {
  const q = schoneTekst(opties.q, 80).toLowerCase();
  return bonnen
    .filter((b) => !opties.status || b.status === opties.status)
    .filter((b) => !q || [b.nummer, b.klant.naam, adresRegel(b.klant), b.klant.plaats, b.omschrijving].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
}

export const euroTekst = (cent: number): string => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);
export const urenTekst = (uren: number): string => new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(uren);
