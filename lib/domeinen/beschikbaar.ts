import { resolveNs } from "node:dns/promises";
import { extensie } from "@/lib/domeinen/extensies";
import { leesDomein } from "@/lib/domeinen/naam";
import { domainAvailability, transipConfigured } from "@/lib/mail/hosting/transip";
import { logger } from "@/lib/logger";

// Is een domeinnaam nog vrij? Volgorde:
//   1. TransIP (als de sleutel er is): het definitieve antwoord;
//   2. RDAP van het register (vaste adressen uit lib/domeinen/extensies.ts):
//      404 = vrij, 200 = bezet;
//   3. geen RDAP (.eu, .be, .de, .nu): heeft de naam naamservers in DNS, dan
//      bezet; zo niet, dan "waarschijnlijk vrij".
// Bij bestellen controleren we altijd opnieuw. Uitkomsten 10 minuten in het
// geheugen (via globalThis: Next bundelt routes apart).

export type Beschikbaarheid = "vrij" | "bezet" | "waarschijnlijk-vrij" | "onbekend";

const TTL = 10 * 60_000;
const g = globalThis as unknown as { __zfDomeinCache?: Map<string, { s: Beschikbaarheid; tot: number }> };
const cache = (g.__zfDomeinCache ??= new Map());

/** RDAP-statuscode → beschikbaarheid. */
export function uitRdap(status: number): Beschikbaarheid {
  if (status === 404) return "vrij";
  if (status === 200) return "bezet";
  return "onbekend";
}

async function viaRdap(basis: string, domein: string): Promise<Beschikbaarheid> {
  const res = await fetch(`${basis}domain/${domein}`, {
    headers: { accept: "application/rdap+json" },
    redirect: "manual",
    signal: AbortSignal.timeout(6000),
  });
  return uitRdap(res.status);
}

async function viaDns(domein: string): Promise<Beschikbaarheid> {
  try {
    const ns = await resolveNs(domein);
    return ns.length ? "bezet" : "onbekend";
  } catch (e) {
    const code = (e as { code?: string }).code;
    // ENOTFOUND = de naam bestaat niet in DNS; ENODATA = wel geregistreerd, geen NS-record
    if (code === "ENOTFOUND") return "waarschijnlijk-vrij";
    if (code === "ENODATA") return "bezet";
    return "onbekend";
  }
}

async function viaTransip(domein: string): Promise<Beschikbaarheid> {
  const a = await domainAvailability(domein);
  if (!a) return "onbekend";
  if (a.status === "free") return "vrij";
  if (a.status === "inyouraccount" || a.status === "unavailable" || a.status === "notfree") return "bezet";
  return "onbekend";
}

export async function beschikbaarheid(domein: string): Promise<Beschikbaarheid> {
  const d = leesDomein(domein);
  if (!d) return "onbekend";
  const naam = `${d.label}.${d.tld}`;
  const oud = cache.get(naam);
  if (oud && oud.tot > Date.now()) return oud.s;
  let s: Beschikbaarheid = "onbekend";
  try {
    if (transipConfigured()) s = await viaTransip(naam);
    if (s === "onbekend") {
      const rdap = extensie(d.tld)?.rdap;
      s = rdap ? await viaRdap(rdap, naam) : await viaDns(naam);
    }
  } catch (e) {
    logger.warn("domein: beschikbaarheid niet te bepalen", { tld: d.tld, error: e instanceof Error ? e.message : String(e) });
    s = "onbekend";
  }
  if (s !== "onbekend") cache.set(naam, { s, tot: Date.now() + TTL });
  if (cache.size > 2000) cache.clear();
  return s;
}
