import { THEME_PRESETS, type Theme } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Meer opties bij de nieuwe website uit de gratis check: zelf de stijl en de
// kleuren kiezen en meteen het verschil zien (POST /api/website-check/website/stijl).
// Puur en client-veilig: het scherm en de server gebruiken dezelfde lijst.
// ---------------------------------------------------------------------------

export const STIJL_KEUZES: { id: NonNullable<Theme["stijl"]>; naam: string; uitleg: string }[] = [
  { id: "diepte", naam: "3D", uitleg: "Je vliegt door je eigen foto's naar binnen; koppen en kaarten springen in echte 3D naar voren als je scrolt." },
  { id: "beleving", naam: "Beleving", uitleg: "Zoals schwarzwald.zekerflex.com: schuine foto's en een band met je aanbod." },
  { id: "premium", naam: "Premium", uitleg: "Donker en groot, met één grote foto." },
  { id: "luxe", naam: "Luxe", uitleg: "Veel ruimte en fijne lijnen. Rustig en chic." },
];
export const isStijlKeuze = (s: unknown): s is NonNullable<Theme["stijl"]> => typeof s === "string" && STIJL_KEUZES.some((k) => k.id === s);

export interface Palet {
  id: string;
  naam: string;
  /** null = de kleuren van hun eigen website */
  kleur: string | null;
  accent: string | null;
}

export const PALETTEN: Palet[] = [
  { id: "eigen", naam: "Je eigen kleuren", kleur: null, accent: null },
  ...THEME_PRESETS.map((p) => ({ id: p.naam.toLowerCase(), naam: p.naam, kleur: p.kleur, accent: p.accent })),
];
export const paletVan = (id: unknown): Palet | null => PALETTEN.find((p) => p.id === id) ?? null;

/**
 * De versie van de motor die nieuwe sites maakt: 1 = hele site lezen (4 nov 2026), 2 = ook foto's achter een
 * beeldoptimalisatie en lazy geladen foto's. Een site van een oudere motor mag op verzoek opnieuw.
 */
export const MOTOR = 2;
export const motorVan = (s: { motor?: number | undefined; overgenomen?: unknown }) => s.motor ?? (s.overgenomen ? 1 : 0);

/** Wat de nieuwe site van hun eigen website (en Google) overnam: dat laat het scherm zien. */
export interface Overgenomen {
  /** gelezen pagina's van hun site */
  paginas: number;
  fotos: number;
  diensten: number;
  uren: boolean;
  vragen: number;
  klantverhalen: number;
  /** hun score op Google, als het profiel bij deze website hoort */
  google: number | null;
}

/** De regels onder "Dit namen we over van je website", alleen wat er echt is. */
export function overgenomenRegels(o: Overgenomen): string[] {
  const n = (x: number, een: string, meer: string) => `${x} ${x === 1 ? een : meer}`;
  return [
    o.paginas > 1 && n(o.paginas, "pagina gelezen", "pagina's gelezen"),
    o.fotos > 0 && n(o.fotos, "foto", "foto's"),
    o.diensten > 0 && n(o.diensten, "dienst of product", "diensten en producten"),
    o.uren && "Je openingstijden",
    o.google !== null && `${o.google.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} op Google`,
    o.klantverhalen > 0 && n(o.klantverhalen, "klantverhaal", "klantverhalen"),
    o.vragen > 0 && n(o.vragen, "veelgestelde vraag", "veelgestelde vragen"),
  ].filter((x): x is string => Boolean(x));
}
