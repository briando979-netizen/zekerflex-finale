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
    naam: "Homepage",
    titel: "ZekerFlex — freelance werk & klussen in heel Nederland | flexwerk, zzp en uitzendwerk",
    omschrijving:
      "Het Nederlandse platform voor freelance werk, flexwerk en uitzendwerk. Vind klussen op basis van vak en reistijd, kies je uitbetaalsnelheid en werk met afspraken en Wet DBA-risicosignalering. Bedrijven betalen € 3,50 per gewerkt uur, zonder abonnement.",
    absoluut: true,
  },
  "/voor-bedrijven": {
    naam: "Voor bedrijven",
    titel: "Flexkrachten & zzp'ers inhuren",
    omschrijving:
      "Huur betrouwbare zzp'ers en flexkrachten in, precies wanneer je ze nodig hebt — horeca, retail, logistiek en meer. Automatische matching per vestiging, GPS check-in en Wet DBA-bewaking ingebouwd. € 3,50 per gewerkt uur, geen abonnement.",
    absoluut: false,
  },
  "/voor-freelancers": {
    naam: "Voor freelancers",
    titel: "Flexwerk & zzp-opdrachten vinden",
    omschrijving:
      "Vind flexwerk en zzp-opdrachten die passen bij je vak en reistijd. Kies je uitbetaalsnelheid, verstuur geen facturen en bekijk Wet DBA-risicosignalen. Meedoen is gratis.",
    absoluut: false,
  },
  "/prijzen": {
    naam: "Prijzen",
    titel: "Prijzen — € 3,50 per gewerkt uur, gratis voor freelancers",
    omschrijving:
      "Wat kost ZekerFlex? Gratis voor freelancers en flexkrachten. Bedrijven betalen € 3,50 platformkosten per gewerkt uur, alleen bij gebruik. Geen abonnement, geen opstartkosten, geen verrassingen.",
    absoluut: false,
  },
  "/over-ons": {
    naam: "Over ons",
    titel: "Over ZekerFlex",
    omschrijving:
      "ZekerFlex is opgebouwd, bedacht en zelf geschreven door oprichter Briando van Essen — een Nederlands platform voor flexibel werk dat eerlijk, snel en zeker hoort te zijn.",
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
