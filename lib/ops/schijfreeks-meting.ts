import { statfs } from "node:fs/promises";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { BACKUP_DIR } from "@/lib/ops/backup";
import { alertOwner } from "@/lib/ops/alert";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { beoordeelSchijf, maakPunt, schoneReeks, voegPuntToe, type SchijfPunt } from "@/lib/ops/schijfreeks";

// De schijfreeks bijhouden (zie lib/ops/schijfreeks.ts). Elk uur (cron -> /api/internal/backup/check?alleen=schijf) meten we de schijf van
// de server met statfs op de back-upmap: dat is een volume op dezelfde schijf als de rest van de server (dezelfde meting als de bestaande
// schijfwaarschuwing in lib/ops/backup.ts). Er worden alleen getallen bewaard: geen schijfnamen, geen paden, geen gebruikers.
// KV-sleutel zonder gebruikers-id, dus niet wisbaar-per-gebruiker (ERASABLE_KV_PREFIXES is niet nodig).
export const K_SCHIJFREEKS = "ops:schijfreeks";

export async function leesSchijfreeks(): Promise<SchijfPunt[]> {
  const waarde = await kvGet<{ punten?: unknown }>(K_SCHIJFREEKS).catch(() => null);
  return schoneReeks(waarde?.punten);
}

/** Meet nu, bewaar het punt, waarschuw bij een trend naar 85 procent en schrijf de hartslag. Null als hier niets te meten valt (geen back-upmap, bijvoorbeeld lokaal). */
export async function bewaarSchijfmeting(nu: number = Date.now(), dir: string = BACKUP_DIR): Promise<SchijfPunt | null> {
  let punt: SchijfPunt;
  try {
    const s = await statfs(dir);
    punt = maakPunt(s.blocks, s.bfree, s.bavail, s.bsize, nu);
  } catch {
    return null;
  }
  try {
    const bewaard = await kvGet<{ punten?: unknown }>(K_SCHIJFREEKS).catch(() => null);
    const punten = voegPuntToe(bewaard?.punten, punt);
    await kvSet(K_SCHIJFREEKS, { punten });
    const b = beoordeelSchijf(punten);
    // vanaf 85 procent waarschuwt de bestaande schijfmelding al (lib/ops/backup.ts, diskAlert): hier alleen de trend die er nog naartoe loopt
    if (b.melding && b.laatste && b.laatste.pct < 85) {
      await alertOwner({
        key: "disk:trend",
        title: "De serverschijf loopt vol op deze groei",
        detail: `${b.melding.tekst} Meestal is het de bouwcache van de uitrollen: laat de server opruimen (Admin, Live zetten, Serveronderhoud, Schijfruimte vrijmaken). Zie Admin, Systeem, Taken voor de reeks.`,
        severity: "warning",
        url: "/admin/systeem",
      });
    }
    void recordCronHeartbeat("schijfreeks", true);
  } catch {
    void recordCronHeartbeat("schijfreeks", false);
  }
  return punt;
}