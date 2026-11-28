import type { Locale } from "@/lib/i18n/config";
import { FREELANCER_DICTS, type FreelancerDict } from "@/lib/i18n/freelancer";
import { GEN_LADERS } from "@/lib/i18n/gen";
import { OVERRIDE_LADERS } from "@/lib/i18n/overrides";
import type { DiepDeels } from "@/lib/i18n/talen-motor";
import { voegSamen } from "@/lib/i18n/samenvoegen";

// ---------------------------------------------------------------------------
// De lader van het werker-woordenboek (talen-motor, 13 nov 2026). De vijf handgemaakte talen staan in FREELANCER_DICTS;
// een machinetaal wordt pas bij gebruik geladen uit zijn eigen gegenereerde bestand (lib/i18n/gen/freelancer.<taal>.ts,
// een lazy chunk per taal), met daaroverheen de verbeteringen uit lib/i18n/overrides/<taal>.ts. Wat daar ontbreekt
// (mislukte of juridische sleutels, functies) komt uit het Engels. Faalt het laden, dan is het hele woordenboek Engels.
// Puur en zonder prisma/kv: ook client-bestanden (useFT) importeren dit.
// ---------------------------------------------------------------------------

export { voegSamen };

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
