import { isTestHost, laatstOpgevolgd, statusVan, type ScanLog } from "@/lib/scans/model";

// ---------------------------------------------------------------------------
// Het dagoverzicht voor sales (puur; versturen: lib/scans/dagoverzicht.ts):
//   nieuw    — gratis scans van het afgelopen etmaal
//   akkoord  — wie het afgelopen etmaal ja zei op het voorstel op maat
//   wachten  — wie contact aanvroeg of verder keek (nieuwe site, stijl, voorstel
//              bekeken), nog niet door sales gemaild is en de laatste 14 dagen
//              nog iets deed; contactaanvragen eerst
// Testsites en onze eigen sites tellen niet mee. Is er het afgelopen etmaal niets
// gebeurd, dan gaat er geen mail (geen dagelijks hetzelfde lijstje).
// ---------------------------------------------------------------------------

export const WACHT_DAGEN = 14;
const DAG = 86_400_000;

export interface ScanOverzicht {
  nieuw: ScanLog[];
  akkoord: ScanLog[];
  wachten: ScanLog[];
  /** er gebeurde het afgelopen etmaal iets (anders geen mail) */
  ietsNieuws: boolean;
}

/** Het laatste moment waarop de bezoeker iets deed (onze eigen opvolging telt niet). */
export function laatsteActiviteit(log: Pick<ScanLog, "stappen" | "at">): string {
  const t = log.stappen.filter((s) => s.stap !== "opgevolgd").map((s) => s.at).sort();
  return t[t.length - 1] ?? log.at;
}

const akkoordOp = (log: ScanLog) => log.stappen.find((s) => s.stap === "deal-akkoord")?.at ?? null;

/** Eén bedrijf = één regel: hetzelfde adres (met of zonder www) of, zonder website, dezelfde naam. */
export const bedrijfVan = (l: Pick<ScanLog, "host" | "naam">) => (l.host ? l.host.toLowerCase().replace(/^www\./, "") : `naam:${l.naam.trim().toLowerCase()}`);
function uniek(logs: readonly ScanLog[]): ScanLog[] {
  const gezien = new Set<string>();
  return logs.filter((l) => {
    const k = bedrijfVan(l);
    if (gezien.has(k)) return false;
    gezien.add(k);
    return true;
  });
}

export function scanOverzicht(logs: readonly ScanLog[], nu = new Date()): ScanOverzicht {
  const t = nu.getTime();
  const echt = logs.filter((l) => !isTestHost(l.host));
  const binnen = (iso: string | null, ms: number) => iso !== null && t - Date.parse(iso) < ms && Date.parse(iso) <= t;
  // al gemaild of al akkoord (bij welke scan dan ook): dat bedrijf wacht niet meer op ons
  const afgehandeld = new Set(echt.filter((l) => laatstOpgevolgd(l) || akkoordOp(l)).map(bedrijfVan));

  const nieuw = uniek([...echt].filter((l) => binnen(l.at, DAG)).sort((a, b) => b.at.localeCompare(a.at)));
  const akkoord = uniek(echt.filter((l) => binnen(akkoordOp(l), DAG)));
  const wachten = uniek(
    echt
      .filter((l) => {
        const st = statusVan(l);
        return (st === "aanvraag" || st === "verder-gekeken") && !afgehandeld.has(bedrijfVan(l)) && binnen(laatsteActiviteit(l), WACHT_DAGEN * DAG);
      })
      .sort((a, b) => {
        const prio = (l: ScanLog) => (statusVan(l) === "aanvraag" ? 0 : 1);
        return prio(a) - prio(b) || laatsteActiviteit(b).localeCompare(laatsteActiviteit(a));
      }),
  );
  const ietsNieuws = nieuw.length > 0 || akkoord.length > 0 || wachten.some((l) => binnen(laatsteActiviteit(l), DAG));
  return { nieuw, akkoord, wachten, ietsNieuws };
}
