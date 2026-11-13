import { POORT_STAPPEN, poortStapVan, werkerOnboardingKlaar, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

// ---------------------------------------------------------------------------
// Admin → Sales & groei → Werkerstrechter: de pure telling (13 nov 2026). Hoe ver komen nieuwe echte werkers door de vijf
// stappen van de poort, en wat doen ze op de nieuwe schermen van de ID-ombouw (de meetcodes)? Alleen aantallen, geen
// namen of id's. lib/admin/werker-trechter.ts haalt de feiten op met de echte poortfunctie (werkerPoortStand, dezelfde
// als de app), dus ook stap 3 (gegevens) is hier exact, geen benadering in SQL. Dit bestand rekent alleen.
// ---------------------------------------------------------------------------

export type PoortSleutel = (typeof POORT_STAPPEN)[number]["sleutel"];

export const STAP_NAAM: Record<PoortSleutel, string> = {
  kind: "1. Richting gekozen",
  branches: "2. Branches gekozen",
  gegevens: "3. Gegevens ingevuld",
  identiteit: "4. ID ingestuurd",
  foto: "5. Profielfoto",
};

export interface WerkerFeiten {
  aangemeld: Date;
  /** de poortfeiten; null = kon niet worden opgehaald (telt als nieuw, niet per stap) */
  poort: WerkerPoortFeiten | null;
  /** ooit op /dashboard/verificatie geweest (een paginaweergave, niet in een QA-sessie) */
  zagVerificatie: boolean;
}

export const WERKER_VENSTERS = [7, 14, 30] as const;
export type WerkerVenster = (typeof WERKER_VENSTERS)[number];

const DAG = 86_400_000;
const binnen = (moment: Date, nu: Date, dagen: number) => moment.getTime() <= nu.getTime() && nu.getTime() - moment.getTime() <= dagen * DAG;

export interface WerkerTelling {
  nieuw: number;
  /** per stap: hoeveel nieuwe werkers hem al haalden (los van de volgorde, zoals de poort zelf telt) */
  perStap: { sleutel: PoortSleutel; naam: string; aantal: number }[];
  /** alle vijf af: mag reageren op klussen */
  klaar: number;
  zagVerificatie: number;
  /** poortfeiten niet op te halen */
  onbekend: number;
}

/** Per venster: de werkers die in die periode zijn aangemeld (een cohort), en per stap hoeveel van hen hem haalden. */
export function werkerTrechter(werkers: readonly WerkerFeiten[], nu: Date, dagen: number): WerkerTelling {
  const cohort = werkers.filter((w) => binnen(w.aangemeld, nu, dagen));
  const bekend = cohort.flatMap((w) => (w.poort ? [w.poort] : []));
  return {
    nieuw: cohort.length,
    perStap: POORT_STAPPEN.map((s) => ({ sleutel: s.sleutel, naam: STAP_NAAM[s.sleutel], aantal: bekend.filter((p) => p[s.feit]).length })),
    klaar: bekend.filter((p) => werkerOnboardingKlaar(p)).length,
    zagVerificatie: cohort.filter((w) => w.zagVerificatie).length,
    onbekend: cohort.length - bekend.length,
  };
}

/** Waar staan ze nu stil: per werker de eerste open stap (de teller "Stap n van 5"), of klaar. */
export function stilBij(werkers: readonly WerkerFeiten[], nu: Date, dagen: number): { sleutel: PoortSleutel | "klaar"; naam: string; aantal: number }[] {
  const tel = new Map<PoortSleutel | "klaar", number>();
  for (const w of werkers) {
    if (!w.poort || !binnen(w.aangemeld, nu, dagen)) continue;
    const k = poortStapVan(w.poort)?.sleutel ?? "klaar";
    tel.set(k, (tel.get(k) ?? 0) + 1);
  }
  return [
    ...POORT_STAPPEN.map((s) => ({ sleutel: s.sleutel, naam: STAP_NAAM[s.sleutel], aantal: tel.get(s.sleutel) ?? 0 })),
    { sleutel: "klaar" as const, naam: "Klaar (mag reageren)", aantal: tel.get("klaar") ?? 0 },
  ];
}

// --- Meetcodes ------------------------------------------------------------------

/** De codes (data-track) van de ID-ombouw en de gegevens: start, chip, controle, klaar-naar, BSN-voorstel, btw/KOR. */
export const MEETCODE_VOORVOEGSELS = ["id-start-", "id-zelf-wissel-", "id-chip-", "id-foto-", "id-controle-", "id-klaar-naar-", "bsn-voorstel-", "gegevens-btw", "gegevens-kor", "verificatie-naar-"] as const;

export function isMeetcode(label: string | null | undefined): label is string {
  return Boolean(label && /^[a-z0-9-]+$/.test(label) && MEETCODE_VOORVOEGSELS.some((v) => label.startsWith(v)));
}

export interface CodeRij {
  label: string | null;
  sessionId: string;
  at: Date;
}

/** Per meetcode: hoe vaak, en in hoeveel sessies, binnen het venster. Gesorteerd op code. */
export function codeTelling(rijen: readonly CodeRij[], nu: Date, dagen: number): { code: string; keer: number; sessies: number }[] {
  const keer = new Map<string, number>();
  const sessies = new Map<string, Set<string>>();
  for (const r of rijen) {
    if (!isMeetcode(r.label) || !binnen(r.at, nu, dagen)) continue;
    keer.set(r.label, (keer.get(r.label) ?? 0) + 1);
    const s = sessies.get(r.label) ?? new Set<string>();
    s.add(r.sessionId);
    sessies.set(r.label, s);
  }
  return [...keer.keys()].sort().map((code) => ({ code, keer: keer.get(code) ?? 0, sessies: sessies.get(code)?.size ?? 0 }));
}

/** Een sessie die beheer, studio of de toegankelijkheidscontrole bezocht, is een QA- of beheersessie: telt niet mee. */
export function isQaPad(path: string): boolean {
  return /^\/(admin|studio|toegankelijkheid)(\/|\?|$)/.test(path);
}
