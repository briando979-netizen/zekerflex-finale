import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { leesWaarschuwingen, type Weerwaarschuwing } from "@/lib/integrations/meteoalarm";

// ---------------------------------------------------------------------------
// De weerwaarschuwingen van het KNMI ophalen via MeteoAlarm (lib/integrations/meteoalarm.ts), hooguit eens per kwartier, en
// bewaren. Valt de feed weg, dan gelden de bewaarde waarschuwingen die nog niet verlopen zijn; zonder die geen waarschuwing
// (dan zegt het scherm niets, wat ook zo is als er geen waarschuwing is).
//   key "weer:waarschuwingen" → { lijst, opgehaald }
// ---------------------------------------------------------------------------

const ADRES = "https://feeds.meteoalarm.org/api/v1/warnings/feeds-netherlands";
const KEY = "weer:waarschuwingen";
const VERS_MS = 15 * 60_000;

export async function weerwaarschuwingen(nu = Date.now()): Promise<Weerwaarschuwing[]> {
  const bewaard = await kvGet<{ lijst: Weerwaarschuwing[]; opgehaald: number }>(KEY).catch(() => null);
  const geldig = (l: Weerwaarschuwing[]) => l.filter((w) => Date.parse(w.tot) > nu);
  if (bewaard && nu - bewaard.opgehaald < VERS_MS) return geldig(bewaard.lijst);
  try {
    const res = await fetch(ADRES, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`MeteoAlarm ${res.status}`);
    const lijst = leesWaarschuwingen(await res.json(), nu);
    await kvSet(KEY, { lijst, opgehaald: nu }).catch(() => undefined);
    return lijst;
  } catch (err) {
    logger.info("meteoalarm: niet bereikbaar, de bewaarde waarschuwingen gelden", { fout: err instanceof Error ? err.message.slice(0, 80) : "onbekend" });
    return bewaard ? geldig(bewaard.lijst) : [];
  }
}
