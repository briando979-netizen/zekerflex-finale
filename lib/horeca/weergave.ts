import type { HorecaZaak } from "@prisma/client";
import { schoon } from "@/lib/horeca/modules";
import { leesTijden } from "@/lib/horeca/tijden";

// Wat het beheer en de site van een zaak te zien krijgen: geen interne velden
// (tenantId, Stripe-account), wel of betalen gekoppeld is.

export interface ZaakWeergave {
  slug: string;
  naam: string;
  soort: string;
  plaats: string;
  adres: string;
  telefoon: string;
  email: string;
  kvk: string;
  kleur: string;
  accent: string;
  online: boolean;
  modules: string[];
  openingstijden: ReturnType<typeof leesTijden>;
  kop: string;
  intro: string;
  betalenGekoppeld: boolean;
}

export function zaakWeergave(z: HorecaZaak): ZaakWeergave {
  const w = (z.website ?? {}) as { kop?: unknown; intro?: unknown };
  return {
    slug: z.slug,
    naam: z.naam,
    soort: z.soort,
    plaats: z.plaats,
    adres: z.adres,
    telefoon: z.telefoon,
    email: z.email,
    kvk: z.kvk,
    kleur: z.kleur,
    accent: z.accent,
    online: z.online,
    modules: schoon(z.modules),
    openingstijden: leesTijden(z.openingstijden),
    kop: typeof w.kop === "string" ? w.kop : "",
    intro: typeof w.intro === "string" ? w.intro : "",
    betalenGekoppeld: Boolean(z.stripeAccountId),
  };
}

export const euro = (cent: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);
