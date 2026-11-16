import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { leesAanbestedingen, TENDER_GROEPEN, voegSamen, type Aanbesteding } from "@/lib/integrations/tenderned";

// ---------------------------------------------------------------------------
// Open aanbestedingen ophalen bij TenderNed (lib/integrations/tenderned.ts): per groep de nieuwste 100, hooguit eens per
// zes uur, en bewaren. Valt TenderNed weg (of verandert de dienst), dan geldt de laatst bewaarde lijst met de tijd erbij.
//   key "tenderned:kansen" → { lijst, opgehaald }
// ---------------------------------------------------------------------------

const BASIS = "https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties";
const KEY = "tenderned:kansen";
const VERS_MS = 6 * 3600_000;

export interface Kansen {
  lijst: Aanbesteding[];
  /** wanneer TenderNed voor het laatst antwoordde (ms) */
  opgehaald: number;
  /** true = TenderNed antwoordde nu niet; dit is de bewaarde lijst */
  oud: boolean;
}

async function groep(g: (typeof TENDER_GROEPEN)[number], nu: number): Promise<Aanbesteding[]> {
  const q = new URLSearchParams({ page: "0", size: "100" });
  for (const c of g.cpv) q.append("cpvCodes", c);
  const res = await fetch(`${BASIS}?${q.toString()}`, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`TenderNed ${res.status}`);
  return leesAanbestedingen(await res.json(), g.id, nu);
}

export async function tendernedKansen(nu = Date.now(), opnieuw = false): Promise<Kansen | null> {
  const bewaard = await kvGet<{ lijst: Aanbesteding[]; opgehaald: number }>(KEY).catch(() => null);
  if (bewaard && !opnieuw && nu - bewaard.opgehaald < VERS_MS) return { ...bewaard, oud: false };
  try {
    const lijst = voegSamen(await Promise.all(TENDER_GROEPEN.map((g) => groep(g, nu))));
    await kvSet(KEY, { lijst, opgehaald: nu }).catch(() => undefined);
    return { lijst, opgehaald: nu, oud: false };
  } catch (err) {
    logger.info("tenderned: niet bereikbaar, de bewaarde lijst geldt", { fout: err instanceof Error ? err.message.slice(0, 80) : "onbekend" });
    return bewaard ? { ...bewaard, oud: true } : null;
  }
}
