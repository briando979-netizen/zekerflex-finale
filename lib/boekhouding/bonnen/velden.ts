// ---------------------------------------------------------------------------
// Bonnen: de velden die het taalmodel uit de OCR-tekst haalt, soepel gelezen en daarna STRENG gecontroleerd (puur).
// Soepel lezen (zoals lib/orchestration/antwoord.ts): een model levert soms een object waar tekst hoort, laat een veld
// weg of schrijft een bedrag als "12,50". Daar maken we van wat er van te maken valt en we slaan onbruikbare velden
// over; de ronde mislukt niet. Streng controleren: wat het model zegt is een voorstel. Elke afwijking (bedrag klopt
// niet, tarief onbekend, datum onmogelijk, categorie onbekend) is een probleem en drukt de zekerheid: de bon gaat dan
// naar "even kijken" en wordt niet vanzelf geboekt.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { btwBedrag, isGeheleCenten, MAX_REGEL_CENTS } from "../bedrag";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { isGeldigeBoekdag } from "../sluiting";

/** De kostenrekeningen uit het zaaischema (rgs-schema.ts); een categorie buiten deze lijst wordt niet aangenomen. */
export const BON_REKENINGEN: Readonly<Record<string, string>> = {
  "4000": "Hosting en infrastructuur",
  "4100": "Software en abonnementen",
  "4200": "Betaalkosten (Stripe)",
  "4300": "Marketing en reclame",
  "4400": "Advies- en accountantskosten",
  "4500": "Verzekeringen",
  "4600": "Reis- en verblijfkosten",
  "4700": "Kantoorkosten",
  "4800": "Bankkosten",
  "4900": "Overige kosten",
};

export const BON_BTW_PERCENTAGES = [0, 9, 21] as const;
export type BonBtwPercentage = (typeof BON_BTW_PERCENTAGES)[number];

/** Boven deze zekerheid (0-1000) mag een bon vanzelf geboekt worden, als alles klopt. */
export const ZEKERHEID_HOOG = 850;
/** Zodra er iets afwijkt, nooit hoger dan dit. */
export const ZEKERHEID_BIJ_PROBLEEM = 400;
/** Heeft het model zelf geen zekerheid genoemd, dan geldt dit. */
const ZEKERHEID_ONBEKEND = 500;

/** Hoe oud een bon hoogstens mag zijn om nog vanzelf te worden aangenomen. */
export const MAX_LEEFTIJD_JAREN = 8;

/** Wat een mens of het model aanlevert; alles mag ontbreken of van een verkeerd type zijn. */
export interface RuweBonVelden {
  leverancier?: unknown;
  factuurnummer?: unknown;
  datum?: unknown;
  totaalCents?: unknown;
  grondslagCents?: unknown;
  btwCents?: unknown;
  btwPercentage?: unknown;
  valuta?: unknown;
  categorie?: unknown;
}

/** Een volledig gecontroleerde bon: dit mag naar de boeking. */
export interface BonVelden {
  leverancier: string;
  factuurnummer: string | null;
  /** "2026-04-10" */
  bonDatum: string;
  totaalCents: number;
  /** totaal min btw: precies, zodat de boeking sluit */
  grondslagCents: number;
  btwCents: number;
  btwPercentage: BonBtwPercentage;
  valuta: string;
  /** een nummer uit BON_REKENINGEN */
  rekeningNummer: string;
}

/** De velden die wel bruikbaar waren, ook als de bon als geheel niet klopt (voor het scherm "even kijken"). */
export interface DeelVelden {
  leverancier?: string;
  factuurnummer?: string;
  bonDatum?: string;
  totaalCents?: number;
  btwCents?: number;
  btwPercentage?: BonBtwPercentage;
  valuta?: string;
  rekeningNummer?: string;
}

export interface BonControle {
  velden: BonVelden | null;
  deel: DeelVelden;
  problemen: string[];
}

// ---- soepel lezen ----------------------------------------------------------

const tekstVeld = (max: number) =>
  z
    .preprocess((v) => {
      if (typeof v === "string") return v;
      if (v === null || v === undefined) return "";
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      if (typeof v === "object") {
        // een model levert soms {naam: "..."} waar tekst hoort: neem de eerste tekst die erin zit
        const eerste = Object.values(v as Record<string, unknown>).find((x) => typeof x === "string");
        if (typeof eerste === "string") return eerste;
        try {
          return JSON.stringify(v);
        } catch {
          return "";
        }
      }
      return "";
    }, z.string())
    .transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max));

/** "12,50", "1.234,56", "EUR 12.50", 1250 (cent), 12.5 (euro) naar gehele centen; null als het geen bedrag is. */
export function naarCenten(v: unknown): number | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    if (Number.isInteger(v)) return v;
    return Math.round(v * 100); // met decimalen is het een bedrag in euro's
  }
  if (typeof v !== "string") return null;
  const s = v.replace(/[^\d,.\-]/g, "");
  if (!/\d/.test(s)) return null;
  const komma = s.lastIndexOf(",");
  const punt = s.lastIndexOf(".");
  const scheiding = Math.max(komma, punt);
  // alleen een scheidingsteken met 1-2 cijfers erachter is een decimaalteken; anders is het een duizendtalteken
  if (scheiding >= 0 && s.length - scheiding - 1 <= 2 && s.length - scheiding - 1 >= 1) {
    const hele = s.slice(0, scheiding).replace(/[,.]/g, "");
    const rest = s.slice(scheiding + 1).padEnd(2, "0");
    const n = Number(`${hele || "0"}.${rest}`);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  const n = Number(s.replace(/[,.]/g, ""));
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function naarPercentage(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v > 0 && v < 1 ? Math.round(v * 100) : v;
  if (typeof v === "string") {
    const m = /(\d+(?:[.,]\d+)?)/.exec(v);
    if (!m) return null;
    const n = Number(m[1]!.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** "2026-04-10" of "10-04-2026" / "10/04/2026" / "10.04.2026" naar "2026-04-10"; null als het geen datum is. */
export function naarBoekdag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  let jaar: number;
  let maand: number;
  let dag: number;
  if (m) {
    [jaar, maand, dag] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
    if (!m) return null;
    [dag, maand, jaar] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  }
  const sleutel = `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
  return isGeldigeBoekdag(sleutel) ? sleutel : null;
}

/** Een zekerheid van het model (0-1, 0-100 of 0-1000) naar promille; null als hij ontbreekt. */
function naarPromille(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const promille = n <= 1 ? n * 1000 : n <= 100 ? n * 10 : n;
  return Math.max(0, Math.min(1000, Math.round(promille)));
}

export interface ModelAntwoord {
  ruw: RuweBonVelden;
  /** wat het model zelf van zijn antwoord vond, 0-1000; null als het dat niet zei */
  zekerheidPromille: number | null;
}

/**
 * Leest het antwoord van het model soepel: een object (ook als er tekst omheen staat is dat al door extractJson
 * opgelost), met de veldnamen die wij vroegen. Geen object = alles leeg; nooit een gooi.
 */
export function leesModelAntwoord(antwoord: unknown): ModelAntwoord {
  const o = antwoord !== null && typeof antwoord === "object" && !Array.isArray(antwoord) ? (antwoord as Record<string, unknown>) : {};
  const kies = (...namen: string[]): unknown => {
    for (const n of namen) if (Object.hasOwn(o, n) && o[n] !== null && o[n] !== undefined) return o[n];
    return undefined;
  };
  const ruw: RuweBonVelden = {};
  const zet = <K extends keyof RuweBonVelden>(k: K, w: unknown) => {
    if (w !== undefined) ruw[k] = w;
  };
  zet("leverancier", kies("leverancier", "supplier", "verkoper"));
  zet("factuurnummer", kies("factuurnummer", "nummer", "invoice_number"));
  zet("datum", kies("datum", "bonDatum", "date"));
  zet("totaalCents", kies("totaal_cents", "totaalCents", "totaal"));
  zet("grondslagCents", kies("grondslag_cents", "grondslagCents", "subtotaal_cents"));
  zet("btwCents", kies("btw_cents", "btwCents", "btw_bedrag", "btw"));
  zet("btwPercentage", kies("btw_tarief", "btwPercentage", "btw_percentage"));
  zet("valuta", kies("valuta", "currency"));
  zet("categorie", kies("categorie", "rekening", "rekeningnummer"));
  return { ruw, zekerheidPromille: naarPromille(kies("zekerheid", "confidence")) };
}

// ---- streng controleren ----------------------------------------------------

/** Dagsleutel van `n` jaar vóór deze dag ("2026-11-12" geeft "2018-11-12"). */
function jarenTerug(dag: string, n: number): string {
  const [j, m, d] = dag.split("-").map(Number) as [number, number, number];
  // 29 feb van een schrikkeljaar valt n jaar terug op 1 maart: Date.UTC rolt dat vanzelf door
  return new Date(Date.UTC(j - n, m - 1, d)).toISOString().slice(0, 10);
}

/** Alle bedragen zoals ze in een stuk tekst staan ("12,50", "1.234,56"), als gehele centen. */
export function bedragenInTekst(tekst: string): Set<number> {
  const uit = new Set<number>();
  for (const m of tekst.matchAll(/\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}(?!\d)|\d+[,.]\d{2}(?!\d)/g)) {
    const c = naarCenten(m[0].replace(/\s/g, ""));
    if (c !== null) uit.add(c);
  }
  return uit;
}

export interface ControleOpties {
  now: Date;
  /** de OCR-tekst: staat het totaalbedrag er letterlijk in? Zo niet, dan heeft het model het verzonnen of misgelezen. */
  tekst?: string | undefined;
}

/**
 * Controleert de velden: gooit nooit, geeft `problemen` (Nederlandse zinnen). `velden` is alleen gevuld als alles klopt
 * en een boeking mogelijk is.
 */
export function controleerBonVelden(ruw: RuweBonVelden, opties: ControleOpties): BonControle {
  const problemen: string[] = [];
  const deel: DeelVelden = {};

  const leverancier = tekstVeld(120).parse(ruw.leverancier);
  if (leverancier.length >= 2) deel.leverancier = leverancier;
  else problemen.push("De leverancier is niet gevonden.");

  const factuurnummer = tekstVeld(60).parse(ruw.factuurnummer);
  if (factuurnummer) deel.factuurnummer = factuurnummer;

  const vandaag = amsterdamDayKey(opties.now);
  const dag = naarBoekdag(ruw.datum);
  if (dag === null) {
    problemen.push("De datum is niet gevonden of is geen geldige dag.");
  } else if (dag > vandaag) {
    problemen.push("De datum van de bon ligt in de toekomst.");
  } else if (dag < jarenTerug(vandaag, MAX_LEEFTIJD_JAREN)) {
    problemen.push(`De bon is ouder dan ${MAX_LEEFTIJD_JAREN} jaar.`);
  } else {
    deel.bonDatum = dag;
  }

  const valuta = tekstVeld(3).parse(ruw.valuta).toUpperCase();
  if (/^[A-Z]{3}$/.test(valuta)) deel.valuta = valuta;
  else problemen.push("De valuta is niet gevonden.");

  const totaal = naarCenten(ruw.totaalCents);
  if (totaal === null || !isGeheleCenten(totaal)) {
    problemen.push("Het totaalbedrag is niet gevonden.");
  } else if (totaal <= 0) {
    problemen.push("Het totaalbedrag is nul of negatief (een creditnota): een mens beslist hoe die wordt geboekt.");
  } else if (totaal > MAX_REGEL_CENTS) {
    problemen.push("Het totaalbedrag is onwaarschijnlijk groot.");
  } else {
    deel.totaalCents = totaal;
    if (opties.tekst !== undefined && !bedragenInTekst(opties.tekst).has(totaal)) {
      problemen.push("Het totaalbedrag staat niet letterlijk in de uitgelezen tekst.");
    }
  }

  const pct = naarPercentage(ruw.btwPercentage);
  const toegestaan = (BON_BTW_PERCENTAGES as readonly number[]).includes(pct ?? -1);
  if (pct === null) problemen.push("Het btw-tarief is niet gevonden.");
  else if (!toegestaan) problemen.push(`Het btw-tarief (${pct}%) is geen 0%, 9% of 21%.`);
  else deel.btwPercentage = pct as BonBtwPercentage;

  let btw = naarCenten(ruw.btwCents);
  if (btw === null && toegestaan && pct === 0) btw = 0; // zonder btw staat er vaak geen btw-regel
  if (btw === null) problemen.push("Het btw-bedrag is niet gevonden.");
  else if (btw < 0) problemen.push("Het btw-bedrag is negatief.");
  else deel.btwCents = btw;

  const categorie = typeof ruw.categorie === "string" ? /^\s*(\d{4})\b/.exec(ruw.categorie)?.[1] : typeof ruw.categorie === "number" ? String(ruw.categorie) : undefined;
  if (categorie !== undefined && Object.hasOwn(BON_REKENINGEN, categorie)) deel.rekeningNummer = categorie;
  else problemen.push("De categorie is onbekend (geen rekening uit het rekeningschema).");

  // De sommen. grondslag + btw = totaal binnen 1 cent, en de btw hoort bij het tarief (ook binnen 1 cent).
  if (deel.totaalCents !== undefined && deel.btwCents !== undefined) {
    if (deel.btwCents > deel.totaalCents) {
      problemen.push("Het btw-bedrag is groter dan het totaal.");
    } else {
      const grondslagRuw = ruw.grondslagCents === undefined ? null : naarCenten(ruw.grondslagCents);
      if (grondslagRuw !== null && Math.abs(grondslagRuw + deel.btwCents - deel.totaalCents) > 1) {
        problemen.push("Grondslag plus btw is niet gelijk aan het totaal.");
      }
      if (deel.btwPercentage !== undefined) {
        const verwacht = btwBedrag(deel.totaalCents - deel.btwCents, deel.btwPercentage * 100);
        if (Math.abs(verwacht - deel.btwCents) > 1) problemen.push("Het btw-bedrag klopt niet met het btw-tarief.");
        if (deel.btwPercentage === 0 && deel.btwCents !== 0) problemen.push("Bij 0% btw hoort een btw-bedrag van nul.");
      }
    }
  }

  if (problemen.length > 0) return { velden: null, deel, problemen };
  const v = deel as Required<Omit<DeelVelden, "factuurnummer">> & { factuurnummer?: string };
  return {
    velden: {
      leverancier: v.leverancier,
      factuurnummer: v.factuurnummer ?? null,
      bonDatum: v.bonDatum,
      totaalCents: v.totaalCents,
      grondslagCents: v.totaalCents - v.btwCents,
      btwCents: v.btwCents,
      btwPercentage: v.btwPercentage,
      valuta: v.valuta,
      rekeningNummer: v.rekeningNummer,
    },
    deel,
    problemen,
  };
}

/**
 * De zekerheid (0-1000) van een uitgelezen bon: de laagste van wat het model zei en wat de OCR toelaat, en nooit
 * hoger dan ZEKERHEID_BIJ_PROBLEEM zodra er een probleem is. Een bon zonder OCR-vertrouwen (pdf-tekstlaag) telt alleen
 * mee met het model.
 */
export function berekenZekerheid(opties: {
  modelPromille: number | null;
  ocrVertrouwen: number | null;
  problemen: readonly string[];
}): number {
  let z = opties.modelPromille ?? ZEKERHEID_ONBEKEND;
  if (opties.ocrVertrouwen !== null) z = Math.min(z, Math.min(1000, Math.round(opties.ocrVertrouwen) * 10 + 100));
  if (opties.problemen.length > 0) z = Math.min(z, ZEKERHEID_BIJ_PROBLEEM);
  return Math.max(0, Math.min(1000, Math.round(z)));
}

/**
 * Het nummer van een bon voor de omschrijving: "B-2026-3F9A12CD" (het jaar van de bon en de eerste acht tekens van de
 * bestandshash). Deterministisch en zonder naam; het gapvrije nummer van de boeking is het boekstuk (IK-2026-000003).
 */
export function bonNummerVoor(bonDatum: string, sha256: string): string {
  return `B-${bonDatum.slice(0, 4)}-${sha256.slice(0, 8).toUpperCase()}`;
}
