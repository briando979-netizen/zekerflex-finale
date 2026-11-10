import { euro } from "@/lib/sites/euro";
import type { Kortingscode } from "@/lib/sites/types";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Kortingscodes in de winkel van een klantsite: controleren en uitrekenen,
// zonder opslag. Puur en client-veilig. Hoe vaak een code al gebruikt is, telt
// de server (lib/sites/korting-gebruik.ts) en komt hier binnen als getal; een
// bezoeker kan dat nooit zelf meesturen. De korting geldt alleen voor de
// producten (nooit voor de verzendkosten) en is nooit meer dan wat ze kosten.
// ---------------------------------------------------------------------------

/** Hoe een code eruitziet: 3 tot 20 hoofdletters, cijfers of streepjes. */
export const CODE_PATROON = /^[A-Z0-9-]{3,20}$/;

/** Een code zoals iemand hem typt (" zomer 10 ") wordt "ZOMER10". */
export const normaliseerCode = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, "");

/** De code uit de winkel die bij deze invoer hoort, ook als hij uit staat. */
export const kortingVoorCode = (codes: Kortingscode[] | undefined, invoer: string): Kortingscode | undefined => {
  const code = normaliseerCode(invoer);
  return code ? (codes ?? []).find((k) => k.code === code) : undefined;
};

/** De korting op dit bedrag aan producten: een percentage (afgerond op centen) of een vast bedrag, nooit meer dan het bedrag zelf. */
export function kortingBedrag(k: Pick<Kortingscode, "soort" | "waarde">, productenCents: number): number {
  const basis = Math.max(0, productenCents);
  if (k.soort === "procent") return Math.min(basis, Math.round((basis * Math.min(100, Math.max(0, k.waarde))) / 100));
  return Math.min(basis, Math.max(0, k.waarde));
}

/** Verlopen: de laatste dag (in Nederland) is voorbij. */
export const isVerlopen = (k: Pick<Kortingscode, "totEnMet">, nu: Date): boolean => k.totEnMet !== null && amsterdamDayKey(nu) > k.totEnMet;

/** Op: de code is al zo vaak gebruikt als mocht. */
export const isOp = (k: Pick<Kortingscode, "maxGebruik">, gebruikt: number): boolean => k.maxGebruik !== null && gebruikt >= k.maxGebruik;

export type KortingUitkomst = { ok: true; korting: Kortingscode; kortingCents: number } | { ok: false; fout: string };

/**
 * Mag deze code bij deze bestelling? `gebruikt` is hoe vaak hij al gebruikt is (de server telt).
 * Een onbekende code en een code die uit staat krijgen dezelfde zin, zodat niemand codes kan raden.
 */
export function controleerKorting(codes: Kortingscode[] | undefined, invoer: string, ctx: { productenCents: number; nu: Date; gebruikt: number }): KortingUitkomst {
  const code = normaliseerCode(invoer);
  const k = kortingVoorCode(codes, code);
  if (!k || !k.actief) return { ok: false, fout: `De kortingscode ${code} kennen we niet. Controleer de code, of haal hem weg.` };
  if (isVerlopen(k, ctx.nu)) return { ok: false, fout: `De kortingscode ${code} is verlopen.` };
  if (isOp(k, ctx.gebruikt)) return { ok: false, fout: `De kortingscode ${code} is al zo vaak gebruikt als kon.` };
  if (k.minimumCents !== null && ctx.productenCents < k.minimumCents) {
    return { ok: false, fout: `De kortingscode ${code} geldt vanaf ${euro(k.minimumCents)} aan producten. Je bestelling is nu ${euro(ctx.productenCents)}.` };
  }
  return { ok: true, korting: k, kortingCents: kortingBedrag(k, ctx.productenCents) };
}

export type KortingStand = "actief" | "uit" | "verlopen" | "op";

/** Hoe de code er nu voor staat, voor de lijst in de studio. */
export function kortingStand(k: Kortingscode, nu: Date, gebruikt: number): KortingStand {
  if (!k.actief) return "uit";
  if (isVerlopen(k, nu)) return "verlopen";
  if (isOp(k, gebruikt)) return "op";
  return "actief";
}

/** Een korte uitleg: "10% korting", "€ 5,00 korting vanaf € 25,00". */
export function kortingTekst(k: Pick<Kortingscode, "soort" | "waarde" | "minimumCents">): string {
  const wat = k.soort === "procent" ? `${k.waarde}% korting` : `${euro(k.waarde)} korting`;
  return k.minimumCents !== null && k.minimumCents > 0 ? `${wat} vanaf ${euro(k.minimumCents)}` : wat;
}

/** Een nieuw nummer voor een kortingscode (in de studio). */
export const nieuwKortingId = (): string => `k${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
