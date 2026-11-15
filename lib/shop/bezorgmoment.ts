import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Het bezorgmoment op de productpagina, zoals bol.com: "Bestel binnen 2 uur en 14 min, morgen in huis" (15 nov 2026). Dezelfde
// belofte als de shop al deed ("Voor 22:00 besteld, morgen in huis"), nu met de tijd die nog over is. Nederlandse tijd
// (lib/time/amsterdam.ts), nooit de klok van de server. Puur; de pagina rekent het pas in de browser uit (geen hydratiefout).
// ---------------------------------------------------------------------------

/** Tot dit uur (Nederlandse tijd) besteld = morgen in huis. */
export const BESTEL_VOOR_UUR = 22;

export interface Bezorgmoment {
  /** "morgen" voor het grensuur, daarna "overmorgen" */
  dag: "morgen" | "overmorgen";
  /** minuten tot het grensuur van vandaag (alleen bij "morgen") */
  resterendMin: number;
}

export function bezorgmoment(nu: Date): Bezorgmoment {
  const p = amsterdamParts(nu);
  const grens = amsterdamToUtc(p.year, p.month, p.day, BESTEL_VOOR_UUR);
  const ms = grens.getTime() - nu.getTime();
  if (ms <= 0) return { dag: "overmorgen", resterendMin: 0 };
  return { dag: "morgen", resterendMin: Math.max(1, Math.ceil(ms / 60_000)) };
}

/** "2 uur en 14 min", "45 min" of "1 uur". */
export function resterendTekst(min: number, teksten: { uurEnMin: string; uren: string; minuten: string }): string {
  const u = Math.floor(min / 60);
  const m = min % 60;
  if (u > 0 && m > 0) return teksten.uurEnMin.replace("{u}", String(u)).replace("{m}", String(m));
  if (u > 0) return teksten.uren.replace("{u}", String(u));
  return teksten.minuten.replace("{m}", String(m));
}
