// ---------------------------------------------------------------------------
// Lightweight i18n — locale lives in a cookie, the page reloads on change and
// server components read it. Employer workspace + shop: NL/EN. Freelancer app
// (/dashboard): NL/EN plus Polish, Romanian and Ukrainian voor flexwerkers
// (lib/i18n/freelancer.ts); die drie zien Engels op werkgever- en shoppagina's.
//
// Talen-motor (13 nov 2026, poortwachter 86): méér talen voor de werker-app, machinaal gemaakt door
// scripts/talen-motor.mjs (lib/i18n/talen-motor.ts) in een eigen gegenereerd bestand per taal
// (lib/i18n/gen/freelancer.<taal>.ts), per taal los geladen (lib/i18n/freelancer-lader.ts). Een machinetaal komt pas in
// MACHINE_LOCALES als dat bestand er is en de steekproef klopt (tests/talen-bewaker.test.ts). Alles hieronder is puur
// (geen woordenboeken): ook client-bestanden importeren dit.
// ---------------------------------------------------------------------------

/** Talen met handgemaakte tekst in elke tabel (Record<BasisLocale, …>). */
export const BASIS_LOCALES = ["nl", "en", "pl", "ro", "uk"] as const;
export type BasisLocale = (typeof BASIS_LOCALES)[number];

/**
 * Machinetalen die live staan: alleen de werker-app (/dashboard), de rest valt terug op het Engels (`basisLocale`).
 * Leeg tot de eerste golf klaar is (fase 2: tr, bg, es). Een taal hier toevoegen = zijn gegenereerde bestand + lader-regel
 * (lib/i18n/gen/index.ts, door het script) + een steekproef van minstens STEEKPROEF_DREMPEL procent.
 */
export const MACHINE_LOCALES = ["de"] as const;
export type MachineLocale = (typeof MACHINE_LOCALES)[number];

export const LOCALES = [...BASIS_LOCALES, ...MACHINE_LOCALES] as const;
/** Languages offered in the employer workspace and the shop. */
export const EMPLOYER_LOCALES = ["nl", "en"] as const satisfies readonly Locale[];
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "nl";
export const LOCALE_COOKIE = "zf_locale";
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Kandidaten voor een volgende golf: bekend in de motor, nog niet in LOCALES (de keuze volgt de gemeten vraag). */
/**
 * Talen die de motor kent. 28 nov 2026 (eigenaar: "elke taal mogelijk in heel ZekerFlex"): de talen van wie in Nederland
 * flexwerk doet — de EU-landen waar de meeste flexwerkers vandaan komen, plus Turks en Russisch. ar en fa lezen van rechts
 * naar links: die komen pas in LOCALES als de opmaak gespiegeld kan worden (eigen stap).
 */
export const KANDIDAAT_TALEN = ["de", "fr", "es", "pt", "it", "bg", "hu", "lt", "lv", "sk", "cs", "el", "hr", "tr", "ru", "ar", "fa"] as const;
export type TaalCode = BasisLocale | MachineLocale | (typeof KANDIDAAT_TALEN)[number];

export interface TaalMeta {
  /** De naam in de eigen taal, zoals de taalkiezer hem toont. */
  naam: string;
  /** English name, voor de opdracht aan het model. */
  engels: string;
  /** Schrijfrichting. ar is een eigen RTL-stap: tot die klaar is staat hij niet in LOCALES. */
  dir: "ltr" | "rtl";
  /** Machinaal vertaald (door de talen-motor) in plaats van met de hand gemaakt. */
  machinaal: boolean;
}

export const TAAL_META: Record<TaalCode, TaalMeta> = {
  nl: { naam: "Nederlands", engels: "Dutch", dir: "ltr", machinaal: false },
  en: { naam: "English", engels: "English", dir: "ltr", machinaal: false },
  pl: { naam: "Polski", engels: "Polish", dir: "ltr", machinaal: false },
  ro: { naam: "Română", engels: "Romanian", dir: "ltr", machinaal: false },
  uk: { naam: "Українська", engels: "Ukrainian", dir: "ltr", machinaal: false },
  de: { naam: "Deutsch", engels: "German", dir: "ltr", machinaal: true },
  fr: { naam: "Français", engels: "French", dir: "ltr", machinaal: true },
  es: { naam: "Español", engels: "Spanish", dir: "ltr", machinaal: true },
  pt: { naam: "Português", engels: "Portuguese", dir: "ltr", machinaal: true },
  it: { naam: "Italiano", engels: "Italian", dir: "ltr", machinaal: true },
  bg: { naam: "Български", engels: "Bulgarian", dir: "ltr", machinaal: true },
  hu: { naam: "Magyar", engels: "Hungarian", dir: "ltr", machinaal: true },
  lt: { naam: "Lietuvių", engels: "Lithuanian", dir: "ltr", machinaal: true },
  lv: { naam: "Latviešu", engels: "Latvian", dir: "ltr", machinaal: true },
  sk: { naam: "Slovenčina", engels: "Slovak", dir: "ltr", machinaal: true },
  cs: { naam: "Čeština", engels: "Czech", dir: "ltr", machinaal: true },
  el: { naam: "Ελληνικά", engels: "Greek", dir: "ltr", machinaal: true },
  hr: { naam: "Hrvatski", engels: "Croatian", dir: "ltr", machinaal: true },
  tr: { naam: "Türkçe", engels: "Turkish", dir: "ltr", machinaal: true },
  ru: { naam: "Русский", engels: "Russian", dir: "ltr", machinaal: true },
  ar: { naam: "العربية", engels: "Arabic", dir: "rtl", machinaal: true },
  fa: { naam: "فارسی", engels: "Persian", dir: "rtl", machinaal: true },
};

export const MACHINE_LABEL_TEKST = "Automatisch vertaald";

/** Kiezertekst: "Türkçe (TR) · Automatisch vertaald" bij een machinetaal, anders "Polski (PL)". */
export function taalLabel(code: TaalCode): string {
  const m = TAAL_META[code];
  const basis = `${m.naam} (${code.toUpperCase()})`;
  return m.machinaal ? `${basis} · ${MACHINE_LABEL_TEKST}` : basis;
}

export const LOCALE_LABELS = Object.fromEntries(LOCALES.map((c) => [c, taalLabel(c)])) as Record<Locale, string>;

export const isMachineLocale = (l: string): boolean => (MACHINE_LOCALES as readonly string[]).includes(l);

/**
 * Een tabel met de vijf handgemaakte talen, aangevuld met het Engels voor elke machinetaal (28 nov 2026). Zo blijft
 * `TABEL[locale]` werken voor elke Locale zonder dat elke aanroep `basisLocale` hoeft te doen. Voegt geen tekst toe aan
 * een bundel: elke machinetaal wijst naar hetzelfde Engelse object.
 */
export function metMachineTalen<T>(basis: Readonly<Record<BasisLocale, T>>): Record<Locale, T> {
  const uit: Record<string, T> = { ...basis };
  for (const l of MACHINE_LOCALES as readonly string[]) uit[l] = basis.en;
  return uit as Record<Locale, T>;
}

/** De taal waarvan een tabel met handgemaakte tekst gebruikt wordt: een machinetaal valt terug op het Engels. */
export function basisLocale(l: Locale): BasisLocale {
  return (BASIS_LOCALES as readonly string[]).includes(l) ? (l as BasisLocale) : "en";
}

export function taalRichting(l: Locale): "ltr" | "rtl" {
  return TAAL_META[l].dir;
}

/** Juridische teksten (uitzendovereenkomst, voorwaarden, privacy, loonstrooktoelichting, BSN/ID-uitleg) worden niet machinaal vertaald. */
export const JURIDISCH_REGEL = "Deze tekst is in het Nederlands en Engels geldig. / This text is valid in Dutch and English.";

// Grenzen van de motor (poortwachter 86): één verzoek tegelijk, alleen 's nachts, de eigen server heeft OOM-risico.
export const MAX_LOAD_START = 3;
export const MAX_LOAD_STOP = 6;
export const STEEKPROEF_AANTAL = 20;
/** Minstens dit percentage van de steekproef moet kloppen, anders komt de taal niet in MACHINE_LOCALES. */
export const STEEKPROEF_DREMPEL = 80;
