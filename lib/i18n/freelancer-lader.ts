import type { Locale } from "@/lib/i18n/config";
import { FREELANCER_DICTS, type FreelancerDict } from "@/lib/i18n/freelancer";
import { GEN_LADERS } from "@/lib/i18n/gen";
import { OVERRIDE_LADERS } from "@/lib/i18n/overrides";
import type { DiepDeels } from "@/lib/i18n/talen-motor";

// ---------------------------------------------------------------------------
// De lader van het werker-woordenboek (talen-motor, 13 nov 2026). De vijf handgemaakte talen staan in FREELANCER_DICTS;
// een machinetaal wordt pas bij gebruik geladen uit zijn eigen gegenereerde bestand (lib/i18n/gen/freelancer.<taal>.ts,
// een lazy chunk per taal), met daaroverheen de verbeteringen uit lib/i18n/overrides/<taal>.ts. Wat daar ontbreekt
// (mislukte of juridische sleutels, functies) komt uit het Engels. Faalt het laden, dan is het hele woordenboek Engels.
// Puur en zonder prisma/kv: ook client-bestanden (useFT) importeren dit.
// ---------------------------------------------------------------------------

/** Legt `laag` over `basis`: tekst, lijst en functie worden vervangen als het type klopt, objecten diep samengevoegd. */
export function voegSamen<T>(basis: T, laag: DiepDeels<T> | undefined): T {
  if (laag === undefined || laag === null) return basis;
  if (typeof basis !== typeof laag) return basis;
  if (Array.isArray(basis) || typeof basis !== "object" || basis === null) return laag as unknown as T;
  const uit: Record<string, unknown> = { ...(basis as Record<string, unknown>) };
  for (const [k, v] of Object.entries(laag as Record<string, unknown>)) {
    if (!Object.hasOwn(uit, k)) continue; // een sleutel die niet (meer) in de bron bestaat doet niet mee
    uit[k] = voegSamen<unknown>(uit[k], v);
  }
  return uit as T;
}

const cache = new Map<string, FreelancerDict>();

/** Is dit een taal met een handgemaakt woordenboek (synchroon beschikbaar)? */
export const heeftVastWoordenboek = (taal: string): taal is keyof typeof FREELANCER_DICTS => Object.hasOwn(FREELANCER_DICTS, taal);

export async function laadFreelancerDict(locale: Locale): Promise<FreelancerDict> {
  if (heeftVastWoordenboek(locale)) return FREELANCER_DICTS[locale];
  // Zolang er geen machinetaal in LOCALES staat is `locale` hierboven al "never"; als gewone tekst blijft de rest typeerbaar.
  const taal: string = locale;
  const gecachet = cache.get(taal);
  if (gecachet) return gecachet;
  const en = FREELANCER_DICTS.en;
  try {
    const lader = Object.hasOwn(GEN_LADERS, taal) ? GEN_LADERS[taal] : undefined;
    if (!lader) return en;
    let dict: FreelancerDict = voegSamen<FreelancerDict>(en, (await lader()).dict);
    const over = Object.hasOwn(OVERRIDE_LADERS, taal) ? OVERRIDE_LADERS[taal] : undefined;
    if (over) dict = voegSamen<FreelancerDict>(dict, (await over()).overrides);
    cache.set(taal, dict);
    return dict;
  } catch {
    return en;
  }
}
