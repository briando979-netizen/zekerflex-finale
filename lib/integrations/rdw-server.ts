import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { leesRdw, type RdwVoertuig } from "@/lib/integrations/rdw";

// ---------------------------------------------------------------------------
// Een kenteken opzoeken bij RDW Open Data (lib/integrations/rdw.ts). Een dag bewaard per kenteken (de APK-datum verandert
// alleen na een keuring). Valt de RDW weg, dan geldt het laatst bewaarde antwoord; anders vult de gebruiker het zelf in
// (de eigen terugval: de velden blijven gewoon invulbaar).
//   key "rdw:<kenteken>" → { voertuig, op }
// ---------------------------------------------------------------------------

const BASIS = "https://opendata.rdw.nl/resource";
const DAG_MS = 24 * 3600_000;

async function haal(dataset: string, kenteken: string): Promise<unknown> {
  const res = await fetch(`${BASIS}/${dataset}.json?kenteken=${encodeURIComponent(kenteken)}`, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`RDW ${res.status}`);
  return res.json();
}

/** Het voertuig bij een genormaliseerd kenteken ("16RSL9"); null = de RDW kent dit kenteken niet. */
export async function rdwVoertuig(kenteken: string, nu = Date.now()): Promise<RdwVoertuig | null> {
  if (!/^[A-Z0-9]{6}$/.test(kenteken)) throw AppError.validation("Een Nederlands kenteken heeft 6 letters en cijfers, bijvoorbeeld AB-12-CD.");
  const key = `rdw:${kenteken}`;
  const bewaard = await kvGet<{ voertuig: RdwVoertuig | null; op: number }>(key).catch(() => null);
  if (bewaard && nu - bewaard.op < DAG_MS) return bewaard.voertuig;
  try {
    const [voertuigen, brandstof] = await Promise.all([haal("m9d7-ebf2", kenteken), haal("8ys7-d773", kenteken).catch(() => null)]);
    const voertuig = leesRdw(voertuigen, brandstof);
    await kvSet(key, { voertuig, op: nu }).catch(() => undefined);
    return voertuig;
  } catch (err) {
    logger.info("rdw: niet bereikbaar", { fout: err instanceof Error ? err.message.slice(0, 80) : "onbekend" });
    if (bewaard) return bewaard.voertuig;
    throw AppError.upstream("De RDW is nu even niet bereikbaar. Vul de gegevens zelf in of probeer het zo nog eens.");
  }
}
