// ---------------------------------------------------------------------------
// "Hey! Wie ben jij?": de pure regels van het stappenscherm voor een nieuwe
// werker (naam, geboortedatum, telefoon, de stappen zelf). Geen prisma/kv, dus
// ook in de browser en los te testen (tests/wie-ben-jij.test.ts). De server
// (lib/onboarding/wie-ben-jij-opslag.ts) controleert met dezelfde functies.
// ---------------------------------------------------------------------------

import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { normaliseerTelefoon } from "@/lib/spoed/regels";

// --- naam -------------------------------------------------------------------

const TUSSENVOEGSELS = new Set([
  "van", "de", "der", "den", "ten", "ter", "het", "'t", "’t", "op", "aan", "in", "te", "von", "el", "al", "bin", "ben", "du", "la", "le", "da", "di", "dos",
]);

/**
 * User.fullName in voornaam en achternaam: de achternaam is het laatste woord met de
 * tussenvoegsels ervoor ("Jan van der Berg" geeft "Jan" en "van der Berg"). Het eerste
 * woord blijft altijd de voornaam. Eén woord geeft alleen een voornaam.
 */
export function splitNaam(volledig: string | null | undefined): { voornaam: string; achternaam: string } {
  const woorden = (volledig ?? "").trim().split(/\s+/).filter(Boolean);
  if (woorden.length === 0) return { voornaam: "", achternaam: "" };
  if (woorden.length === 1) return { voornaam: woorden[0] ?? "", achternaam: "" };
  let begin = woorden.length - 1;
  while (begin > 1 && TUSSENVOEGSELS.has((woorden[begin - 1] ?? "").toLowerCase())) begin -= 1;
  return { voornaam: woorden.slice(0, begin).join(" "), achternaam: woorden.slice(begin).join(" ") };
}

/** De twee velden samen als User.fullName (spaties opgeschoond). */
export function voegNaam(voornaam: string, achternaam: string): string {
  return `${voornaam} ${achternaam}`.trim().replace(/\s+/g, " ");
}

// --- geboortedatum ------------------------------------------------------------

export function dagenInMaand(jaar: number, maand: number): number {
  return new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, "0");

export function maakDatum(jaar: number, maand: number, dag: number): string {
  return `${jaar}-${pad(maand)}-${pad(dag)}`;
}

/** "2001-04-09" naar delen, of null als het geen bestaande datum is. */
export function leesDatum(s: string | null | undefined): { jaar: number; maand: number; dag: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  const jaar = Number(m[1]);
  const maand = Number(m[2]);
  const dag = Number(m[3]);
  if (maand < 1 || maand > 12 || dag < 1 || dag > dagenInMaand(jaar, maand)) return null;
  return { jaar, maand, dag };
}

/** Is de geboortedatum (YYYY-MM-DD) minstens 18 jaar geleden, naar de Nederlandse dag van `nu`? */
export function isMeerderjarig(geboortedatum: string, nu: Date = new Date()): boolean {
  const d = leesDatum(geboortedatum);
  if (!d) return false;
  // tekstvergelijking werkt; wie op 29 februari is geboren, wordt in een gewoon jaar een dag later 18
  return maakDatum(d.jaar + 18, d.maand, d.dag) <= amsterdamDayKey(nu);
}

export type DatumFout = "leeg" | "ongeldig" | "onder18";

/** Sleutel van de fout bij een geboortedatum, of null als hij goed is (bestaat, niet in de toekomst, niet ouder dan 110, 18+). */
export function controleerGeboortedatum(s: string | null | undefined, nu: Date = new Date()): DatumFout | null {
  if (!s || !s.trim()) return "leeg";
  const d = leesDatum(s);
  if (!d) return "ongeldig";
  const vandaag = amsterdamDayKey(nu);
  const nuJaar = Number(vandaag.slice(0, 4));
  if (s > vandaag || d.jaar < nuJaar - 110) return "ongeldig";
  return isMeerderjarig(s, nu) ? null : "onder18";
}

// --- telefoon -----------------------------------------------------------------

/** Landnummers: de landen van de thuisbasis (lib/geo/thuisland.ts) en de meest gebruikte daarbuiten (lib/werkrecht/landen.ts). */
export const LANDNUMMERS: readonly { land: string; nummer: string }[] = [
  { land: "NL", nummer: "+31" }, { land: "BE", nummer: "+32" }, { land: "DE", nummer: "+49" }, { land: "LU", nummer: "+352" },
  { land: "FR", nummer: "+33" }, { land: "AT", nummer: "+43" }, { land: "CH", nummer: "+41" }, { land: "LI", nummer: "+423" },
  { land: "DK", nummer: "+45" }, { land: "SE", nummer: "+46" }, { land: "NO", nummer: "+47" }, { land: "FI", nummer: "+358" },
  { land: "IS", nummer: "+354" }, { land: "IE", nummer: "+353" }, { land: "GB", nummer: "+44" }, { land: "PL", nummer: "+48" },
  { land: "CZ", nummer: "+420" }, { land: "SK", nummer: "+421" }, { land: "HU", nummer: "+36" }, { land: "SI", nummer: "+386" },
  { land: "HR", nummer: "+385" }, { land: "RO", nummer: "+40" }, { land: "BG", nummer: "+359" }, { land: "LT", nummer: "+370" },
  { land: "LV", nummer: "+371" }, { land: "EE", nummer: "+372" }, { land: "ES", nummer: "+34" }, { land: "PT", nummer: "+351" },
  { land: "IT", nummer: "+39" }, { land: "MT", nummer: "+356" }, { land: "GR", nummer: "+30" }, { land: "CY", nummer: "+357" },
  { land: "TR", nummer: "+90" }, { land: "UA", nummer: "+380" }, { land: "RS", nummer: "+381" }, { land: "BA", nummer: "+387" },
  { land: "MK", nummer: "+389" }, { land: "AL", nummer: "+355" }, { land: "MD", nummer: "+373" }, { land: "GE", nummer: "+995" },
  { land: "MA", nummer: "+212" }, { land: "ZA", nummer: "+27" }, { land: "US", nummer: "+1" }, { land: "AE", nummer: "+971" },
];

export const STANDAARD_LANDNUMMER = "+31";

export function isLandnummer(v: unknown): v is string {
  return typeof v === "string" && LANDNUMMERS.some((l) => l.nummer === v);
}

/**
 * Landnummer en nummer (zoals ingetypt) naar E.164 ("+31612345678"), of null als het niet klopt.
 * Een nummer dat zelf met "+" of "00" begint, houdt zijn eigen land. Een voorloopnul ("06…") valt weg.
 * Een Nederlands nummer heeft precies negen cijfers na de 0.
 */
export function telefoonNaarE164(landnummer: string, invoer: string): string | null {
  const kaal = invoer.replace(/[\s().-]/g, "");
  if (!kaal || !/^\+?\d+$/.test(kaal)) return null;
  const landDigits = landnummer.replace(/\D/g, "");
  if (!landDigits) return null;
  let kandidaat: string;
  if (kaal.startsWith("+")) kandidaat = kaal;
  else if (kaal.startsWith("00")) kandidaat = `+${kaal.slice(2)}`;
  else kandidaat = `+${landDigits}${kaal.replace(/^0+/, "")}`;
  if (kandidaat.startsWith("+31") && !/^\+31[1-9]\d{8}$/.test(kandidaat)) return null;
  return normaliseerTelefoon(kandidaat);
}

/** Een opgeslagen nummer terug in landnummer en nummer voor het formulier; een nummer dat we niet kennen komt ongewijzigd in het nummerveld. */
export function splitTelefoon(opgeslagen: string | null | undefined): { landnummer: string; nummer: string } {
  const t = normaliseerTelefoon(opgeslagen);
  if (!t) return { landnummer: STANDAARD_LANDNUMMER, nummer: (opgeslagen ?? "").trim() };
  const lang = [...LANDNUMMERS].sort((a, b) => b.nummer.length - a.nummer.length).find((l) => t.startsWith(l.nummer));
  if (!lang) return { landnummer: STANDAARD_LANDNUMMER, nummer: t };
  const rest = t.slice(lang.nummer.length);
  return { landnummer: lang.nummer, nummer: lang.nummer === "+31" ? `0${rest}` : rest };
}

// --- de gegevens van stap 1 ----------------------------------------------------

export interface PersoonGegevens {
  voornaam: string;
  achternaam: string;
  geboortedatum: string;
  landnummer: string;
  telefoon: string;
}

export type PersoonVeld = "voornaam" | "achternaam" | "geboortedatum" | "telefoon";
export type PersoonFout = "voornaam" | "achternaam" | "datum" | "onder18" | "telefoon";

/** Alle fouten van stap 1 per veld (leeg object = goed). */
export function controleerPersoon(g: PersoonGegevens, nu: Date = new Date()): Partial<Record<PersoonVeld, PersoonFout>> {
  const uit: Partial<Record<PersoonVeld, PersoonFout>> = {};
  if (g.voornaam.trim().length < 1) uit.voornaam = "voornaam";
  if (g.achternaam.trim().length < 1 || voegNaam(g.voornaam, g.achternaam).length > 120) uit.achternaam = "achternaam";
  const d = controleerGeboortedatum(g.geboortedatum, nu);
  if (d === "onder18") uit.geboortedatum = "onder18";
  else if (d) uit.geboortedatum = "datum";
  if (!telefoonNaarE164(g.landnummer, g.telefoon)) uit.telefoon = "telefoon";
  return uit;
}

/** Is stap 1 af? Zo ja, dan begint iemand die terugkomt bij de volgende stap. */
export function persoonKlaar(g: PersoonGegevens, nu: Date = new Date()): boolean {
  return Object.keys(controleerPersoon(g, nu)).length === 0;
}

// --- de stappen -----------------------------------------------------------------

export type WieStap = "persoon" | "woon" | "id";

/** De stappen van deze werker: een identiteit die al is bevestigd, vraagt geen ID-check meer. */
export function stappenVoor(f: { idKlaar: boolean }): WieStap[] {
  return f.idKlaar ? ["persoon", "woon"] : ["persoon", "woon", "id"];
}

/** Waar iemand verdergaat: de eerste stap die nog niet af is. */
export function beginStap(f: { persoonKlaar: boolean; woonKlaar: boolean; idKlaar: boolean }): WieStap {
  if (!f.persoonKlaar) return "persoon";
  if (!f.woonKlaar) return "woon";
  return f.idKlaar ? "woon" : "id";
}
