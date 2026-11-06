import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { listWebsiteChecks } from "@/lib/website-check/run";
import { metStap, scanSleutel, type ScanLog, type ScanSoort, type ScanStap } from "@/lib/scans/model";

// ---------------------------------------------------------------------------
// Het logboek van de gratis scans (lib/scans/model.ts).
//   KV "scan-log:<soort>:<scanId>" — één scan met wat de bezoeker daarna deed
// Bedrijfsgegevens van een openbare website, geen persoonsgegevens van de bezoeker
// (geen IP, geen cookie). Wie contact aanvraagt, staat in de lead, niet hier.
// ---------------------------------------------------------------------------

const KEY = (sleutel: string) => `scan-log:${sleutel}`;

export async function getScanLog(soort: ScanSoort, scanId: string): Promise<ScanLog | null> {
  return kvGet<ScanLog>(KEY(scanSleutel(soort, scanId))).catch(() => null);
}

export async function bewaarScanLog(log: ScanLog): Promise<ScanLog> {
  await kvSet(KEY(log.sleutel), log);
  return log;
}

/**
 * Een vervolgstap vastleggen, met eventueel een veld erbij (in één keer, zodat twee schrijfacties elkaar niet
 * overschrijven); zonder logboek (een scan van vóór 4 nov 2026) gebeurt er niets. Faalt stil.
 */
export async function logStap(
  soort: ScanSoort,
  scanId: string,
  stap: ScanStap,
  info?: string,
  velden: Partial<Pick<ScanLog, "leadId" | "siteSlug">> = {},
  now = new Date(),
): Promise<void> {
  try {
    const log = await getScanLog(soort, scanId);
    if (!log) return;
    const next = { ...metStap(log, stap, now.toISOString(), info), ...velden };
    await bewaarScanLog(next);
  } catch {
    /* het logboek mag een scan nooit laten mislukken */
  }
}

/** Een lead, deal of nieuwe site aan een scan hangen. */
export async function koppel(soort: ScanSoort, scanId: string, velden: Partial<Pick<ScanLog, "leadId" | "dealId" | "siteSlug" | "naam" | "plaats">>): Promise<void> {
  try {
    const log = await getScanLog(soort, scanId);
    if (log) await bewaarScanLog({ ...log, ...velden });
  } catch {
    /* zie logStap */
  }
}

/** Alle scans, nieuwste eerst: het logboek plus de website-checks van vóór het logboek (afgeleid uit hun rapport). */
export async function lijstScans(limit = 1000): Promise<ScanLog[]> {
  const [logs, checks] = await Promise.all([
    kvListValues<ScanLog>("scan-log:", 5000).catch(() => [] as ScanLog[]),
    listWebsiteChecks(2000).catch(() => []),
  ]);
  const bekend = new Set(logs.filter((l) => l && typeof l.sleutel === "string").map((l) => l.sleutel));
  const oud: ScanLog[] = checks
    .filter((c) => !bekend.has(scanSleutel("website", c.id)))
    .map((c) => {
      const problemen = (c.findings ?? []).filter((f) => f.status === "probleem").length;
      const stappen: ScanLog["stappen"] = [{ stap: "gescand", at: c.at }];
      if (c.nieuweSite) stappen.push({ stap: "nieuwe-site", at: c.nieuweSite.at, info: c.nieuweSite.slug });
      if (c.leadId) stappen.push({ stap: "aanvraag", at: c.at });
      return {
        sleutel: scanSleutel("website", c.id),
        soort: "website" as const,
        scanId: c.id,
        at: c.at,
        host: c.host,
        naam: c.host,
        plaats: null,
        score: c.score,
        samenvatting: `${problemen} ${problemen === 1 ? "probleem" : "problemen"}`,
        rapport: `/website-check?r=${c.id}`,
        leadId: c.leadId,
        dealId: null,
        siteSlug: c.nieuweSite?.slug ?? null,
        stappen,
      };
    });
  return [...logs.filter((l) => l && typeof l.sleutel === "string" && typeof l.at === "string"), ...oud].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
