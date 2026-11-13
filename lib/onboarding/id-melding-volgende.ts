import type { Locale } from "@/lib/i18n/config";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { openVerplicht, poortStapVan, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";
import { volgendeStapHref, type PoortSleutel } from "@/lib/onboarding/volgende-stap";

// ---------------------------------------------------------------------------
// Waar de melding "ID geverifieerd" (lib/onboarding/id-geverifieerd.ts) naartoe wijst (13 nov 2026). Hij linkte altijd naar
// /dashboard/eerste-indruk, maar die pagina stuurt terug naar Verificatie zolang soort, branches of gegevens open staat:
// gemeten bij 7 van de 20 werkers met een ID zonder foto, zonder uitleg. Nu: de eerste open stap van de poort (poortStapVan,
// dezelfde teller als "Stap n van 5"), met in één zin wat er nog moet. Is alleen de foto nog open, dan de fotostap; is alles
// af (of lukt het opzoeken niet), dan zoals vroeger "eerste indruk". Server-only (leest FREELANCER_DICTS).
// ---------------------------------------------------------------------------

export interface IdMeldingVolgende {
  /** de eerste open stap; null = alles af of onbekend */
  sleutel: PoortSleutel | null;
  /** hoeveel verplichte stappen er nog open staan */
  open: number;
  /** het pad van de link in push en mail */
  pad: string;
}

export function idMeldingVolgende(f: WerkerPoortFeiten | null): IdMeldingVolgende {
  const stap = f ? poortStapVan(f) : null;
  if (!f || !stap) return { sleutel: null, open: 0, pad: "/dashboard/eerste-indruk" };
  // dezelfde plek als na de ID-scan (lib/onboarding/volgende-stap.ts, ae)
  return { sleutel: stap.sleutel, open: openVerplicht(f), pad: volgendeStapHref(stap.sleutel) };
}

const NAAM = {
  kind: "kindStep",
  branches: "brancheStep",
  gegevens: "gegevensStep",
  identiteit: "identiteitStep",
  foto: "fotoStep",
} as const satisfies Record<PoortSleutel, keyof (typeof FREELANCER_DICTS)["nl"]["start"]>;

/** De naam van de stap zoals de wizard hem noemt (d4, vijf talen), met een kleine letter: hij staat midden in een zin. */
export function stapNaam(sleutel: PoortSleutel, taal: Locale): string {
  const naam = FREELANCER_DICTS[taal].start[NAAM[sleutel]];
  return naam.charAt(0).toLocaleLowerCase(taal) + naam.slice(1);
}
