import { euro } from "@/lib/sites/euro";
import type { VerzendGebied, Verzendmethode, Winkel } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Verzendmethoden van de winkel van een klantsite: afhalen (met adres) en
// bezorgen (met tarief, gratis vanaf een bedrag en een gebied). Een winkel
// zonder eigen lijst (alles van vóór 10 nov 2026) houdt afhalen en één
// bezorging uit `levering`, met dezelfde bedragen: voor die winkels verandert
// er niets. Puur en client-veilig (de studio gebruikt dezelfde regels).
// ---------------------------------------------------------------------------

/** De methoden die bij een oude winkel horen; vaste nummers, zodat een bestelformulier van vóór de lijst blijft werken. */
const UIT_LEVERING = { afhalen: "vafhalen", bezorgen: "vbezorgen" } as const;

/** Alle verzendmethoden van de winkel, ook die uit staan. Zonder eigen lijst: afhalen en bezorgen uit `levering`. */
export function verzendmethodenVan(w: Pick<Winkel, "verzendmethoden" | "levering">): Verzendmethode[] {
  if (w.verzendmethoden) return w.verzendmethoden;
  const l = w.levering;
  const basis = { gebied: "nl" as const, adres: "", levertijd: "", actief: true };
  return [
    ...(l.afhalen ? [{ ...basis, id: UIT_LEVERING.afhalen, soort: "afhalen" as const, naam: "Afhalen", prijsCents: 0, gratisVanafCents: null }] : []),
    ...(l.bezorgen ? [{ ...basis, id: UIT_LEVERING.bezorgen, soort: "bezorgen" as const, naam: "Bezorgen", prijsCents: Math.max(0, l.bezorgkostenCents), gratisVanafCents: l.gratisVanafCents }] : []),
  ];
}

/** Waar de klant uit kiest: de methoden die aan staan, in de volgorde van de winkel. */
export const actieveVerzendmethoden = (w: Pick<Winkel, "verzendmethoden" | "levering">): Verzendmethode[] => verzendmethodenVan(w).filter((m) => m.actief);

/** Wat deze methode kost bij dit bedrag aan producten (na korting). */
export const verzendKosten = (m: Pick<Verzendmethode, "prijsCents" | "gratisVanafCents">, productenCents: number): number =>
  m.gratisVanafCents != null && productenCents >= m.gratisVanafCents ? 0 : Math.max(0, m.prijsCents);

/**
 * `levering` volgens de lijst, voor de onderdelen die alleen dat lezen: afhalen en bezorgen aan als er
 * zo'n methode aan staat, en de bedragen van de goedkoopste bezorging.
 */
export function leveringVan(methoden: Verzendmethode[]): Winkel["levering"] {
  const aan = methoden.filter((m) => m.actief);
  const bezorg = aan.filter((m) => m.soort === "bezorgen").sort((a, b) => a.prijsCents - b.prijsCents)[0];
  return { afhalen: aan.some((m) => m.soort === "afhalen"), bezorgen: Boolean(bezorg), bezorgkostenCents: bezorg?.prijsCents ?? 0, gratisVanafCents: bezorg?.gratisVanafCents ?? null };
}

/** Een nieuw nummer voor een verzendmethode (in de studio). */
export const nieuwVerzendId = (): string => `v${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;

// ---- landen -----------------------------------------------------------------

/** De landen van de EU met hun Nederlandse naam, Nederland voorop. */
export const EU_LANDEN: { code: string; naam: string }[] = [
  { code: "NL", naam: "Nederland" },
  { code: "BE", naam: "België" },
  { code: "BG", naam: "Bulgarije" },
  { code: "CY", naam: "Cyprus" },
  { code: "DK", naam: "Denemarken" },
  { code: "DE", naam: "Duitsland" },
  { code: "EE", naam: "Estland" },
  { code: "FI", naam: "Finland" },
  { code: "FR", naam: "Frankrijk" },
  { code: "GR", naam: "Griekenland" },
  { code: "HU", naam: "Hongarije" },
  { code: "IE", naam: "Ierland" },
  { code: "IT", naam: "Italië" },
  { code: "HR", naam: "Kroatië" },
  { code: "LV", naam: "Letland" },
  { code: "LT", naam: "Litouwen" },
  { code: "LU", naam: "Luxemburg" },
  { code: "MT", naam: "Malta" },
  { code: "AT", naam: "Oostenrijk" },
  { code: "PL", naam: "Polen" },
  { code: "PT", naam: "Portugal" },
  { code: "RO", naam: "Roemenië" },
  { code: "SI", naam: "Slovenië" },
  { code: "SK", naam: "Slowakije" },
  { code: "ES", naam: "Spanje" },
  { code: "CZ", naam: "Tsjechië" },
  { code: "SE", naam: "Zweden" },
];

/** Een land buiten de EU: de klant schrijft de naam zelf op. */
export const ANDER_LAND = "ZZ";

const EU = new Set(EU_LANDEN.map((l) => l.code));

/** Een landcode uit het formulier: een EU-land of ANDER_LAND; alles anders (of leeg) is Nederland. */
export function leesLand(code: string | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  return EU.has(c) || c === ANDER_LAND ? c : "NL";
}

export function landNaam(code: string, anders = ""): string {
  if (code === ANDER_LAND) return anders.trim() || "een land buiten de EU";
  return EU_LANDEN.find((l) => l.code === code)?.naam ?? code;
}

/** Bezorgt deze methode naar dit land? */
export function bezorgtNaar(gebied: VerzendGebied, land: string): boolean {
  if (gebied === "overal") return true;
  if (gebied === "eu") return EU.has(land);
  return land === "NL";
}

/** Welke landen het bestelformulier laat kiezen: geen keuze (alleen Nederland), de EU, of de EU en een ander land. */
export function landKeuze(methoden: Verzendmethode[]): VerzendGebied {
  const bezorg = methoden.filter((m) => m.soort === "bezorgen");
  if (bezorg.some((m) => m.gebied === "overal")) return "overal";
  if (bezorg.some((m) => m.gebied === "eu")) return "eu";
  return "nl";
}

export const GEBIED_TEKST: Record<VerzendGebied, string> = {
  nl: "Alleen in Nederland",
  eu: "In de hele EU",
  overal: "Ook buiten de EU",
};

/** Eén regel voor de klant en de studio: "€ 4,95, gratis vanaf € 50,00" of "Gratis". */
export function prijsTekst(m: Pick<Verzendmethode, "prijsCents" | "gratisVanafCents">): string {
  if (m.prijsCents <= 0) return "Gratis";
  return m.gratisVanafCents != null ? `${euro(m.prijsCents)}, gratis vanaf ${euro(m.gratisVanafCents)}` : euro(m.prijsCents);
}
