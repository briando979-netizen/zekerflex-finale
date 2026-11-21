// ---------------------------------------------------------------------------
// Titel en omschrijving voor Google van de vaste pagina's (Site-ontwerper →
// SEO). De standaard staat hier en de pagina's lezen hem hier; een eigen
// versie staat in KV (lib/ontwerp/seo-store.ts). Puur en browser-veilig.
// ---------------------------------------------------------------------------

export interface SeoStandaard {
  naam: string;
  titel: string;
  omschrijving: string;
  /** true = de titel staat er precies zo; anders komt " · ZekerFlex" erachter (sjabloon in app/layout.tsx) */
  absoluut: boolean;
}

export const SEO_ACHTERVOEGSEL = " · ZekerFlex";

export const SEO_STANDAARD = {
  "/": {
    naam: "Homepage (werkzoekenden)",
    titel: "ZekerFlex — freelance werk & klussen in heel Nederland",
    omschrijving:
      "Vind flexwerk en klussen bij jou in de buurt. Je ziet vooraf wat je verdient en krijgt je geld op je eigen rekening. Ook zonder KVK, en gratis.",
    absoluut: true,
  },
  "/bedrijven": {
    naam: "Homepage voor bedrijven",
    // 21 nov 2026: alleen flexwerk in Google (eigenaar zag "website" en "software" in de zoekresultaten)
    titel: "Flexkrachten, zzp'ers en uitzendkrachten voor je bedrijf",
    omschrijving:
      "Plaats een klus en flexwerkers, zzp'ers en uitzendkrachten in de buurt reageren. Je betaalt € 3,50 per gewerkt uur, zonder abonnement of opstartkosten.",
    absoluut: false,
  },
  "/voor-bedrijven": {
    naam: "Voor bedrijven",
    titel: "Flexkrachten & zzp'ers inhuren",
    omschrijving:
      "Huur zzp'ers en flexkrachten in wanneer je ze nodig hebt, met GPS-inchecken en Wet DBA-bewaking. € 3,50 per gewerkt uur, geen abonnement.",
    absoluut: false,
  },
  "/voor-freelancers": {
    naam: "Voor freelancers",
    titel: "Flexwerk & zzp-opdrachten vinden",
    omschrijving:
      "Vind flexwerk en zzp-opdrachten die passen bij je vak en reistijd. Kies hoe snel je wordt uitbetaald en verstuur geen facturen. Meedoen is gratis.",
    absoluut: false,
  },
  "/prijzen": {
    naam: "Prijzen",
    titel: "Prijzen — € 3,50 per gewerkt uur",
    omschrijving:
      "Gratis voor freelancers en flexkrachten. Bedrijven betalen € 3,50 per gewerkt uur, alleen bij gebruik. Geen abonnement, geen opstartkosten.",
    absoluut: false,
  },
  "/over-ons": {
    naam: "Over ons",
    titel: "Over ZekerFlex",
    omschrijving:
      "ZekerFlex is bedacht en zelf gebouwd door oprichter Briando van Essen: een Nederlands platform voor flexwerk dat eerlijk, snel en zeker hoort te zijn.",
    absoluut: false,
  },
} satisfies Record<string, SeoStandaard>;

export type SeoPad = keyof typeof SEO_STANDAARD;
export const SEO_PADEN = Object.keys(SEO_STANDAARD) as SeoPad[];
export const isSeoPad = (v: unknown): v is SeoPad => typeof v === "string" && (SEO_PADEN as string[]).includes(v);

export interface SeoEigen {
  titel: string;
  omschrijving: string;
}

/** Richtlijnen van Google (wat er in de zoekresultaten past). */
export const SEO_TITEL_RICHT = 60;
export const SEO_OMSCHRIJVING_RICHT = 155;

const schoon = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Leeg veld = de standaard voor dat veld; beide leeg = geen eigen versie (null). */
export function normalizeSeoEigen(raw: unknown): SeoEigen | null {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const titel = schoon(r.titel, 120);
  const omschrijving = schoon(r.omschrijving, 320);
  return titel || omschrijving ? { titel, omschrijving } : null;
}

/** De titel zoals hij in Google staat (met " · ZekerFlex" als de pagina het sjabloon gebruikt). */
export const volledigeTitel = (pad: SeoPad, titel: string) => (SEO_STANDAARD[pad].absoluut ? titel : `${titel}${SEO_ACHTERVOEGSEL}`);
