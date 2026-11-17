// ---------------------------------------------------------------------------
// Wat het Kadaster (BAG, de Basisregistratie Adressen en Gebouwen, via PDOK: gratis, zonder sleutel) over een adres weet:
// waarvoor het gebouw gebruikt mag worden en hoe groot het is. Puur: geen fetch (die staat in bag-server.ts).
//   1. PDOK Locatieserver: postcode + huisnummer → adresseerbaarobject_id (het verblijfsobject)
//   2. BAG OGC API: https://api.pdok.nl/kadaster/bag/ogc/v2/collections/verblijfsobject/items?identificatie=<id>&f=json
//      → features[0].properties { gebruiksdoel: "winkelfunctie", oppervlakte: 23820 }
// ---------------------------------------------------------------------------

export interface BagAdres {
  /** "Dam 1, 1012JS Amsterdam" zoals PDOK het schrijft */
  adres: string;
  /** gebruiksdoelen volgens de BAG ("woonfunctie", "kantoorfunctie", …) */
  gebruiksdoelen: string[];
  /** gebruiksoppervlakte in m² */
  oppervlakte: number | null;
}

/** "Hoofdstraat 12a" / "12-2" / "12 A" → het huisnummer (12); geen nummer = null */
export function huisnummerVan(v: string | null | undefined): number | null {
  const m = /^\s*(\d{1,5})/.exec(v ?? "");
  return m?.[1] ? Number(m[1]) : null;
}

/**
 * Het huisnummer met letter of toevoeging uit een adresregel: "Hoofdstraat 12a" → "12a", "Plein 1945 3-2" → "3-2".
 * Wat na een komma komt (plaats, verdieping) telt niet mee. Geen nummer aan het eind = null.
 */
export function huisnummerUitAdresregel(regel: string | null | undefined): string | null {
  const m = /(\d{1,5})\s*([a-z])?\s*(?:[-/]\s*([a-z0-9]{1,4}))?\s*$/i.exec((regel ?? "").split(",")[0] ?? "");
  if (!m?.[1]) return null;
  return `${m[1]}${m[2] ?? ""}${m[3] ? `-${m[3]}` : ""}`;
}

/** "1012 js" → "1012JS"; geen Nederlandse postcode = null */
export function postcodeVan(v: string | null | undefined): string | null {
  const p = (v ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[1-9]\d{3}[A-Z]{2}$/.test(p) ? p : null;
}

/** "12 A" / "12-a" → "12a": zo vergelijken we een huisnummer met letter of toevoeging */
const kaal = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Het adres uit een antwoord van de Locatieserver dat bij het huisnummer hoort: id van het verblijfsobject en de
 * weergavenaam. Op één huisnummer staan soms meerdere adressen (12, 12a, 12-2): alleen het adres met precies deze letter of
 * toevoeging telt. Past er geen, dan liever niets dan het gebouw van de buren.
 */
export function leesLocatieAdres(json: unknown, huisnummer: string): { id: string; adres: string } | null {
  const docs = (json as { response?: { docs?: unknown[] } } | null)?.response?.docs;
  const lijst = (Array.isArray(docs) ? docs : []).filter((d): d is Record<string, unknown> => !!d && typeof d === "object");
  const doel = kaal(huisnummer);
  const d = doel ? lijst.find((x) => typeof x.huis_nlt === "string" && kaal(x.huis_nlt) === doel) : undefined;
  const id = typeof d?.adresseerbaarobject_id === "string" ? d.adresseerbaarobject_id : "";
  if (!/^\d{16}$/.test(id)) return null;
  return { id, adres: typeof d?.weergavenaam === "string" ? d.weergavenaam.slice(0, 200) : "" };
}

/** Gebruiksdoel en oppervlakte uit een antwoord van de BAG OGC API. */
export function leesVerblijfsobject(json: unknown): { gebruiksdoelen: string[]; oppervlakte: number | null } | null {
  const features = (json as { features?: unknown[] } | null)?.features;
  const p = Array.isArray(features) ? ((features[0] as { properties?: Record<string, unknown> } | undefined)?.properties ?? null) : null;
  if (!p) return null;
  const ruw = p.gebruiksdoel;
  const doelen = (Array.isArray(ruw) ? ruw : typeof ruw === "string" ? ruw.split(",") : [])
    .map((d) => (typeof d === "string" ? d.trim().toLowerCase() : ""))
    .filter((d) => /^[a-z ]{3,40}$/.test(d));
  const opp = typeof p.oppervlakte === "number" && Number.isFinite(p.oppervlakte) && p.oppervlakte > 0 ? Math.round(p.oppervlakte) : null;
  if (doelen.length === 0 && opp === null) return null;
  return { gebruiksdoelen: [...new Set(doelen)], oppervlakte: opp };
}

/** Een gebouw dat alleen een woning is: bij een bedrijfsadres het vragen waard (thuis werken kan prima, een nepbedrijf ook). */
export const alleenWonen = (b: BagAdres) => b.gebruiksdoelen.length > 0 && b.gebruiksdoelen.every((d) => d === "woonfunctie");

/** "winkelfunctie en kantoorfunctie, 240 m²" */
export function bagOmschrijving(b: BagAdres): string {
  const doelen = b.gebruiksdoelen.length === 0 ? "gebruik onbekend" : b.gebruiksdoelen.length === 1 ? b.gebruiksdoelen[0]! : `${b.gebruiksdoelen.slice(0, -1).join(", ")} en ${b.gebruiksdoelen.at(-1)}`;
  return b.oppervlakte === null ? doelen : `${doelen}, ${new Intl.NumberFormat("nl-NL").format(b.oppervlakte)} m²`;
}
