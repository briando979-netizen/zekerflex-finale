import { readFile } from "node:fs/promises";
import { alertOwner, type OpsAlert } from "@/lib/ops/alert";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";

// ---------------------------------------------------------------------------
// Geheugenbewaking van de server. Op 7 nov liep het wisselgeheugen vol tijdens een uitrol: de server werd traag (load 138)
// en gaf 20 minuten honderden 502's, zonder dat iemand het eerder zag. Elke 10 minuten (cron → /api/internal/backup/check
// ?alleen=geheugen) lezen we /proc/meminfo en waarschuwen de eigenaar vóór het zover is. Een volle wisselruimte alleen is
// geen probleem (oude, ongebruikte pagina's staan er rustig in); het gaat erom dat er weinig geheugen over is om mee te
// werken. In een container toont /proc/meminfo de cijfers van de hele server, en die tellen hier. Puur te testen: de
// meting en de beoordeling zijn los van het lezen van het bestand.
// ---------------------------------------------------------------------------

export interface Geheugen {
  /** beschikbaar geheugen (zonder te wisselen), in MB */
  beschikbaarMb: number;
  totaalMb: number;
  /** hoeveel van de wisselruimte in gebruik is, 0..100 */
  wisselPercent: number;
}

const kbNaarMb = (kb: number): number => Math.round(kb / 1024);

/** Leest de waarden die we nodig hebben uit de tekst van /proc/meminfo; `null` als die ontbreken. */
export function parseMeminfo(tekst: string): Geheugen | null {
  const waarde = (naam: string): number | null => {
    const m = new RegExp(`^${naam}:\\s+(\\d+)\\s*kB`, "m").exec(tekst);
    return m?.[1] ? Number(m[1]) : null;
  };
  const totaal = waarde("MemTotal");
  const beschikbaar = waarde("MemAvailable");
  const wisselTotaal = waarde("SwapTotal") ?? 0;
  const wisselVrij = waarde("SwapFree") ?? 0;
  if (totaal === null || beschikbaar === null) return null;
  const wisselPercent = wisselTotaal > 0 ? Math.round(((wisselTotaal - wisselVrij) / wisselTotaal) * 100) : 0;
  return { beschikbaarMb: kbNaarMb(beschikbaar), totaalMb: kbNaarMb(totaal), wisselPercent };
}

export type GeheugenStand = "ok" | "let-op" | "kritiek";

/**
 * Kritiek: bijna niets meer over, of weinig over én de wisselruimte (bijna) vol, dan gaat de server trekken.
 * Let op: weinig ruimte, of een bijna volle wisselruimte met een kleine marge. Daaronder is alles goed.
 */
export function beoordeelGeheugen(g: Geheugen): { stand: GeheugenStand; reden: string } {
  const wisselVol = g.wisselPercent >= 90;
  if (g.beschikbaarMb < 1024 || (g.beschikbaarMb < 2048 && wisselVol)) {
    return { stand: "kritiek", reden: `nog ${g.beschikbaarMb} MB geheugen vrij en de wisselruimte is ${g.wisselPercent}% vol` };
  }
  if (g.beschikbaarMb < 2048 || (wisselVol && g.beschikbaarMb < 3072)) {
    return { stand: "let-op", reden: `nog ${g.beschikbaarMb} MB geheugen vrij, wisselruimte ${g.wisselPercent}% vol` };
  }
  return { stand: "ok", reden: `${g.beschikbaarMb} MB vrij` };
}

/** De melding voor de eigenaar bij een stand; `null` bij ok. In gewoon Nederlands. */
export function geheugenMelding(g: Geheugen): OpsAlert | null {
  const { stand, reden } = beoordeelGeheugen(g);
  if (stand === "ok") return null;
  const kritiek = stand === "kritiek";
  return {
    key: `geheugen:${stand}`,
    title: kritiek ? "De server heeft bijna geen geheugen meer" : "De server heeft weinig geheugen over",
    detail: `${reden}. ${
      kritiek
        ? "Het geheugen is bijna op, dus de site kan traag worden of haperen. Wacht met een nieuwe uitrol tot het weer ruim is; start zo nodig het zware eigen AI-model opnieuw."
        : "Er is nog ruimte, maar niet veel. Rol liever niet uit tot het weer ruimer is."
    }`,
    severity: kritiek ? "critical" : "warning",
    url: "/admin/systeem",
  };
}

/** Meet het geheugen en waarschuwt zo nodig. Gooit nooit; `null` als er niets te lezen is (bijvoorbeeld op een ontwikkelmachine). */
export async function checkGeheugen(lees: () => Promise<string> = () => readFile("/proc/meminfo", "utf8")): Promise<Geheugen | null> {
  let g: Geheugen | null;
  try {
    g = parseMeminfo(await lees());
  } catch {
    return null;
  }
  if (!g) return null;
  const melding = geheugenMelding(g);
  if (melding) await alertOwner(melding);
  void recordCronHeartbeat("geheugen-check", true);
  return g;
}
