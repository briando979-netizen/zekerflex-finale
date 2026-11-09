import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { zuiverLog, zuiverRegistraties, type LogRegel, type RegistratieRegel } from "@/lib/locatie/avg-regels";

// AVG voor de Op locatie-modules: één persoon wegwerken uit alle bedrijven.
// Dit raakt de KV-sleutels toegang-registraties:<tenant>, kluis-log:<tenant>
// en voertuig:<userId> (die laatste staat al in ERASABLE_KV_PREFIXES).

export async function wisPersoonUitLocatie(userId: string): Promise<{ registraties: number; logregels: number; voertuig: boolean }> {
  let registraties = 0;
  let logregels = 0;
  for (const { key, value } of await kvListEntries<Record<string, RegistratieRegel>>("toegang-registraties:", 5000)) {
    if (!value || typeof value !== "object") continue;
    const { map, verwijderd } = zuiverRegistraties(value, userId);
    if (verwijderd > 0) {
      await kvSet(key, map);
      registraties += verwijderd;
    }
  }
  for (const { key, value } of await kvListEntries<LogRegel[]>("kluis-log:", 5000)) {
    if (!Array.isArray(value)) continue;
    const { log, geraakt } = zuiverLog(value, userId);
    if (geraakt > 0) {
      await kvSet(key, log);
      logregels += geraakt;
    }
  }
  const voertuig = (await kvGet(`voertuig:${userId}`)) !== null;
  if (voertuig) await kvDelete(`voertuig:${userId}`);
  return { registraties, logregels, voertuig };
}
