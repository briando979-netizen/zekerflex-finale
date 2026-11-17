import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { komendeVakantie, leesSchoolvakanties, schooljaarVan, type KomendeVakantie, type Schoolvakantie } from "@/lib/integrations/schoolvakanties";

// ---------------------------------------------------------------------------
// De schoolvakanties van dit en volgend schooljaar ophalen bij de Rijksoverheid (lib/integrations/schoolvakanties.ts),
// hooguit eens per week per schooljaar, en bewaren. De data veranderen zelden; valt de bron weg, dan geldt de bewaarde lijst.
//   key "schoolvakanties:<schooljaar>" → { lijst, opgehaald }
// ---------------------------------------------------------------------------

const ADRES = (jaar: string) => `https://opendata.rijksoverheid.nl/v1/infotypes/schoolholidays/schoolyear/${jaar}?output=json`;
const VERS_MS = 7 * 86_400_000;

async function schooljaar(jaar: string, nu: number): Promise<Schoolvakantie[]> {
  const key = `schoolvakanties:${jaar}`;
  const bewaard = await kvGet<{ lijst: Schoolvakantie[]; opgehaald: number }>(key).catch(() => null);
  if (bewaard && nu - bewaard.opgehaald < VERS_MS) return bewaard.lijst;
  try {
    const res = await fetch(ADRES(jaar), { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Rijksoverheid ${res.status}`);
    const lijst = leesSchoolvakanties(await res.json());
    if (lijst.length > 0) await kvSet(key, { lijst, opgehaald: nu }).catch(() => undefined);
    return lijst.length > 0 ? lijst : (bewaard?.lijst ?? []);
  } catch (err) {
    logger.info("schoolvakanties: niet bereikbaar, de bewaarde lijst geldt", { jaar, fout: err instanceof Error ? err.message.slice(0, 80) : "onbekend" });
    return bewaard?.lijst ?? [];
  }
}

/** De eerstvolgende schoolvakantie die binnen zes weken begint, of null. */
export async function komendeSchoolvakantie(nu = Date.now()): Promise<KomendeVakantie | null> {
  const vandaag = amsterdamDayKey(nu);
  const dit = schooljaarVan(vandaag);
  const start = Number(dit.slice(0, 4));
  const [a, b] = await Promise.all([schooljaar(dit, nu), schooljaar(`${start + 1}-${start + 2}`, nu)]);
  return komendeVakantie([...a, ...b], vandaag);
}
