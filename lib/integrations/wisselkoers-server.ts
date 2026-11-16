import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { leesEcbKoersen, type Koersen } from "@/lib/integrations/wisselkoers";

// ---------------------------------------------------------------------------
// De dagkoersen van de ECB ophalen (lib/integrations/wisselkoers.ts), hooguit eens per zes uur, en bewaren. Valt de ECB
// weg, dan gelden de laatst bewaarde koersen (de eigen terugval); zijn die er niet, dan geen omrekening (de Winkel-AI zegt
// dan eerlijk dat je zelf moet omrekenen).
//   key "wisselkoers:ecb" → { datum, koersen, opgehaald }
// ---------------------------------------------------------------------------

const ADRES = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const KEY = "wisselkoers:ecb";
const VERS_MS = 6 * 3600_000;

export async function ecbKoersen(nu = Date.now()): Promise<Koersen | null> {
  const bewaard = await kvGet<Koersen & { opgehaald: number }>(KEY).catch(() => null);
  if (bewaard && nu - bewaard.opgehaald < VERS_MS) return { datum: bewaard.datum, koersen: bewaard.koersen };
  try {
    const res = await fetch(ADRES, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/xml" } });
    const vers = res.ok ? leesEcbKoersen(await res.text()) : null;
    if (vers) {
      await kvSet(KEY, { ...vers, opgehaald: nu }).catch(() => undefined);
      return vers;
    }
  } catch (err) {
    logger.info("wisselkoers: ECB niet bereikbaar, de bewaarde koersen gelden", { fout: err instanceof Error ? err.message.slice(0, 80) : "onbekend" });
  }
  return bewaard ? { datum: bewaard.datum, koersen: bewaard.koersen } : null;
}
