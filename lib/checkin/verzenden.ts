import {
  WACHTRIJ_GEBEURTENIS,
  bewaarTikken,
  laadTikken,
  opVolgorde,
  opgeruimd,
  uitkomstVan,
  verwijderTik,
  verzendBody,
  type BewaardeTik,
} from "@/lib/checkin/wachtrij";
import type { FreelancerDict } from "@/lib/i18n/freelancer";

// ---------------------------------------------------------------------------
// De bewaarde in- en uitchecks (lib/checkin/wachtrij.ts) versturen, één voor
// één in de volgorde van tikken. Geen bereik of de server even weg: stoppen,
// de rest blijft staan (een uitcheck gaat nooit vóór zijn incheck). Aangekomen
// of geweigerd: van het toestel af, met de uitslag als venster-gebeurtenis
// zodat de knop (CheckInPanel) en de balk (BewaardeTikken) hem tonen.
// Eén verzending tegelijk per tabblad (globalThis); tussen tabbladen of na
// een verloren antwoord vangt de server het af met het clientId.
// ---------------------------------------------------------------------------

export interface Uitslag {
  tik: BewaardeTik;
  uitkomst: "aangekomen" | "geweigerd";
  /** aangekomen: wat de server vastlegde */
  antwoord: { recordedAt: string | null; actualStart: string | null; actualEnd: string | null; withinGeofence: boolean; distanceToBranchMeters: number } | null;
  /** geweigerd: de code van de server (details.reden, lib/timesheets/offline.ts) en zijn melding */
  reden: string | null;
  melding: string | null;
}

export interface WachtrijMelding {
  userId: string;
  uitslagen: Uitslag[];
}

/** Laat de knop en de balk weten dat de wachtrij veranderde. */
export function meldWachtrij(userId: string, uitslagen: Uitslag[] = []): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<WachtrijMelding>(WACHTRIJ_GEBEURTENIS, { detail: { userId, uitslagen } }));
  } catch {
    // oude browser zonder CustomEvent: de balk ververst bij de volgende poging
  }
}

const tekst = (v: unknown): string | null => (typeof v === "string" ? v : null);

function leesAntwoord(d: unknown): Uitslag["antwoord"] {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  return {
    recordedAt: tekst(o.recordedAt),
    actualStart: tekst(o.actualStart),
    actualEnd: tekst(o.actualEnd),
    withinGeofence: o.withinGeofence === true,
    distanceToBranchMeters: typeof o.distanceToBranchMeters === "number" ? o.distanceToBranchMeters : 0,
  };
}

function leesFout(d: unknown): { reden: string | null; melding: string | null } {
  const fout = (d && typeof d === "object" ? (d as { error?: unknown }).error : null) as { message?: unknown; details?: unknown } | null | undefined;
  const details = (fout?.details && typeof fout.details === "object" ? fout.details : {}) as { reden?: unknown };
  return { reden: tekst(details.reden), melding: tekst(fout?.message) };
}

type MetSlot = typeof globalThis & { __zfTikkenBezig?: Set<string> };

export async function verstuurBewaard(
  userId: string,
  opts: { fetchFn?: typeof fetch; nu?: () => Date } = {},
): Promise<Uitslag[]> {
  const g = globalThis as MetSlot;
  const bezig = (g.__zfTikkenBezig ??= new Set<string>());
  if (bezig.has(userId)) return [];
  bezig.add(userId);
  const doeFetch = opts.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const nu = opts.nu ?? (() => new Date());
  const uitslagen: Uitslag[] = [];
  let opgeruimdeTikken = false;
  try {
    const lijst = laadTikken(userId);
    const houden = opgeruimd(lijst, nu().getTime());
    if (houden.length !== lijst.length) {
      bewaarTikken(userId, houden);
      opgeruimdeTikken = true;
    }
    for (const tik of opVolgorde(houden)) {
      const res = await doeFetch(`/api/timesheets/${encodeURIComponent(tik.timesheetId)}/gps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verzendBody(tik, nu())),
        cache: "no-store",
      }).catch(() => null);
      const uitkomst = uitkomstVan(res ? res.status : null);
      if (uitkomst === "opnieuw") break;
      const d: unknown = res ? await res.json().catch(() => null) : null;
      verwijderTik(userId, tik.id);
      uitslagen.push(
        uitkomst === "aangekomen"
          ? { tik, uitkomst, antwoord: leesAntwoord(d), reden: null, melding: null }
          : { tik, uitkomst, antwoord: null, ...leesFout(d) },
      );
    }
  } finally {
    bezig.delete(userId);
  }
  if (uitslagen.length > 0 || opgeruimdeTikken) meldWachtrij(userId, uitslagen);
  return uitslagen;
}

/** De reden van een weigering in de taal van de app; een onbekende reden: de melding van de server. */
export function weigerTekst(c: FreelancerDict["checkin"], u: Pick<Uitslag, "reden" | "melding">): string {
  const r = c.offlineReden;
  // eigen sleutel (zoals Object.hasOwn, dat oudere Safari nog niet kent): "constructor" telt niet
  if (u.reden && Object.prototype.hasOwnProperty.call(r, u.reden)) return r[u.reden as keyof typeof r];
  return u.melding ?? c.failed;
}
