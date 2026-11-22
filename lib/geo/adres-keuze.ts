// ---------------------------------------------------------------------------
// Een adres gekozen uit de adreszoeker (components/app/AddressAutocomplete.tsx, PDOK via /api/geo/search) → de velden
// van een vestiging. Puur: de browser en de tests lezen het.
//
// 22 nov 2026 (gebruikersonderzoek B18/B19): wie "Grote Markt 1, 9712HN Groningen" koos, moest postcode en plaats nog
// eens typen, anders bleef "Opslaan" grijs. PDOK geeft ze al mee; die vullen we nu zelf in.
// ---------------------------------------------------------------------------

export interface AdresKeuze {
  /** zoals PDOK het schrijft, bijv. "Grote Markt 1, 9712HN Groningen" */
  label: string;
  postcode?: string | null | undefined;
  plaats?: string | null | undefined;
}

export interface AdresVelden {
  /** straat en huisnummer, zonder postcode en plaats erachter */
  straat: string;
  postcode: string;
  plaats: string;
}

/**
 * Eén regel voor een opgeslagen vestiging: "Grote Markt 1, 9712HN Groningen". Oudere vestigingen hebben de hele PDOK-naam
 * als adresregel; dan staan postcode en plaats er al in en komen ze er niet nog eens achter.
 */
export function vestigingRegel(v: { addressLine: string; postalCode: string; city: string }): string {
  const regel = v.addressLine.trim();
  const rest = `${v.postalCode} ${v.city}`.trim();
  if (!rest || (v.postalCode.trim() && regel.replace(/\s/g, "").includes(v.postalCode.replace(/\s/g, "")))) return regel;
  return regel ? `${regel}, ${rest}` : rest;
}

export function adresUitKeuze(k: AdresKeuze): AdresVelden {
  const label = k.label.trim();
  const postcode = (k.postcode ?? "").trim();
  const plaats = (k.plaats ?? "").trim();
  // een adres met postcode: het deel vóór de eerste komma is straat en huisnummer (de rest staat al in postcode en plaats)
  const voorKomma = label.split(",")[0]?.trim() ?? "";
  const straat = postcode && voorKomma && voorKomma !== label ? voorKomma : label;
  return { straat, postcode, plaats };
}
