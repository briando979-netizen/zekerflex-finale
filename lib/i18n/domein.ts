import { BASIS_LOCALES, type BasisLocale, type Locale } from "@/lib/i18n/config";
import { voegSamen } from "@/lib/i18n/samenvoegen";
import type { DiepDeels } from "@/lib/i18n/talen-motor";

// ---------------------------------------------------------------------------
// Een "domein" met teksten in elke taal (28 nov 2026): inloggen, chat, hulpcentrum, … Hetzelfde idee als de werker-lader
// (lib/i18n/freelancer-lader.ts), voor elke tabel met de vijf handgemaakte talen: een machinetaal komt uit zijn eigen
// gegenereerde bestand (lib/i18n/gen/<domein>.<taal>.ts), wordt pas geladen als iemand hem kiest, en ligt over het Engels heen
// (wat ontbreekt, blijft Engels). Zo komen er nooit vijftien talen tegelijk in een browserbundel.
//   server:  await AUTH.laad(locale)
//   client:  useDomein(AUTH, locale)   (components/i18n/useDomein.ts)
// Puur: ook client-bestanden importeren dit.
// ---------------------------------------------------------------------------

export type DomeinLader<T> = () => Promise<{ dict: DiepDeels<T> }>;

export interface Domein<T> {
  /** Een handgemaakte taal meteen; null voor een machinetaal (die moet eerst geladen worden). */
  vast(locale: Locale): T | null;
  /** Elke taal: een machinetaal over het Engels heen; mislukt het laden, dan het Engels. */
  laad(locale: Locale): Promise<T>;
  /** Wat een machinetaal laat zien zolang hij laadt. */
  readonly engels: T;
}

const isBasis = (l: string): l is BasisLocale => (BASIS_LOCALES as readonly string[]).includes(l);

export function maakDomein<T>(basis: Readonly<Record<BasisLocale, T>>, laders: Readonly<Record<string, DomeinLader<T>>>): Domein<T> {
  const cache = new Map<string, T>();
  return {
    engels: basis.en,
    vast: (locale) => (isBasis(locale) ? basis[locale] : null),
    async laad(locale) {
      if (isBasis(locale)) return basis[locale];
      const taal: string = locale;
      const gecachet = cache.get(taal);
      if (gecachet) return gecachet;
      const lader = Object.hasOwn(laders, taal) ? laders[taal] : undefined;
      if (!lader) return basis.en;
      try {
        const dict = voegSamen<T>(basis.en, (await lader()).dict);
        cache.set(taal, dict);
        return dict;
      } catch {
        return basis.en;
      }
    },
  };
}
