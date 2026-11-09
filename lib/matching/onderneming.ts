// ---------------------------------------------------------------------------
// Wanneer telt een zzp'er als een echt ingeschreven onderneming? Puur, gedeeld
// door de matching (lib/matching/engine.ts) en het overnemen van een klus
// (lib/replacements/reassign.ts, app/api/me/replacement/respond).
//
//   • Nederland: een actieve inschrijving in het Handelsregister (kvkValid).
//   • Buitenland, zonder KVK: een geldig EU-btw-nummer volgens VIES. De
//     onboarding telt dat al "als een actieve KVK-inschrijving"
//     (lib/onboarding/verify.ts), maar zette kvkValid niet: alleen het KVK-pad
//     doet dat (lib/company/registration.ts). Zonder deze regel viel zo iemand
//     altijd buiten de matching.
//
// `country` is hier het fiscale land: dat komt uit het btw-nummer (VIES),
// niet uit het woonadres (zie lib/geo/thuisland.ts).
// ---------------------------------------------------------------------------

export interface OndernemingVelden {
  kvkValid: boolean;
  vatValid: boolean;
  country: string;
}

/** Ingeschreven onderneming: actieve KVK, of in het buitenland een geldig EU-btw-nummer. */
export function ondernemingGeldig(p: OndernemingVelden): boolean {
  return p.kvkValid || (p.vatValid && p.country !== "NL");
}

/** Zzp'er voor de matching: ingeschreven onderneming én een geldig btw-nummer. */
export function zzpGeschikt(p: OndernemingVelden): boolean {
  return p.vatValid && ondernemingGeldig(p);
}
