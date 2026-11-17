import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { huisnummerVan, leesLocatieAdres, leesVerblijfsobject, postcodeVan, type BagAdres } from "@/lib/geo/bag";

// ---------------------------------------------------------------------------
// Gebruiksdoel en oppervlakte van een adres bij het Kadaster opvragen (lib/geo/bag.ts), via PDOK. Gratis en zonder
// sleutel; een gebouw verandert zelden, dus 30 dagen bewaren. Geen antwoord = null (het beheerscherm zegt dan niets).
//   key "bag:<postcode><huisnummer>" → { adres, gebruiksdoelen, oppervlakte, opgehaald }
// Een bedrijfsadres staat in het Handelsregister en is openbaar; het blijft hier bij het beheer.
// ---------------------------------------------------------------------------

const LOCATIE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const BAG = "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/verblijfsobject/items";
const VERS_MS = 30 * 86_400_000;

async function json(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`PDOK ${res.status}`);
  return res.json();
}

export async function bagVoorAdres(postcode: string | null | undefined, huisnummer: string | null | undefined, nu = Date.now()): Promise<BagAdres | null> {
  const pc = postcodeVan(postcode);
  const nr = huisnummerVan(huisnummer);
  if (!pc || nr === null || !huisnummer) return null;
  // met letter of toevoeging erbij ("12a"): 12 en 12a zijn verschillende gebouwen
  const key = `bag:${pc}${huisnummer.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
  const bewaard = await kvGet<BagAdres & { opgehaald: number }>(key).catch(() => null);
  if (bewaard && nu - bewaard.opgehaald < VERS_MS) return { adres: bewaard.adres, gebruiksdoelen: bewaard.gebruiksdoelen, oppervlakte: bewaard.oppervlakte };
  try {
    const q = new URLSearchParams({ q: `postcode:${pc} and huisnummer:${nr}`, fq: "type:adres", rows: "50", fl: "adresseerbaarobject_id,weergavenaam,huis_nlt" });
    const plek = leesLocatieAdres(await json(`${LOCATIE}?${q.toString()}`), huisnummer);
    if (!plek) return null;
    const vo = leesVerblijfsobject(await json(`${BAG}?identificatie=${plek.id}&f=json`));
    if (!vo) return null;
    const uit: BagAdres = { adres: plek.adres, ...vo };
    await kvSet(key, { ...uit, opgehaald: nu }).catch(() => undefined);
    return uit;
  } catch (err) {
    logger.info("bag: PDOK niet bereikbaar", { fout: err instanceof Error ? err.message.slice(0, 80) : "onbekend" });
    return bewaard ? { adres: bewaard.adres, gebruiksdoelen: bewaard.gebruiksdoelen, oppervlakte: bewaard.oppervlakte } : null;
  }
}
