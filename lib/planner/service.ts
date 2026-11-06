import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kandidatenVoor, losOpIntern, STANDAARD_INSTELLINGEN, totalen, type PlanDienst, type PlanInstellingen, type PlanKracht, type PlanResultaat, type Toewijzing } from "@/lib/planner/solver";

// ---------------------------------------------------------------------------
// Welke oplosser rekent het rooster uit:
//   - de OR-Tools-dienst (deploy/planner, CP-SAT) als PLANNER_URL staat: die
//     krijgt de haalbare kandidaten met kosten en lost de toewijzing exact op;
//   - anders, of als die dienst niet antwoordt, de ingebouwde oplosser.
// Beide geven hetzelfde PlanResultaat, dus de schermen merken er niets van.
// ---------------------------------------------------------------------------

interface OrToolsAntwoord {
  toewijzingen?: { dienstId: string; krachtId: string }[];
  status?: string;
}

export async function losOp(diensten: PlanDienst[], krachten: PlanKracht[], instellingen: Partial<PlanInstellingen> = {}): Promise<PlanResultaat> {
  const i = { ...STANDAARD_INSTELLINGEN, ...instellingen };
  const url = env.PLANNER_URL;
  if (!url || diensten.length === 0) return losOpIntern(diensten, krachten, i);

  const t0 = Date.now();
  const kandidaten = kandidatenVoor(diensten, krachten, i);
  try {
    const r = await fetch(`${url.replace(/\/+$/, "")}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diensten: diensten.map((d) => ({ id: d.id, start: d.start, einde: d.einde, pauzeMinuten: d.pauzeMinuten, plekken: d.plekken })),
        krachten: krachten.map((k) => ({ id: k.id, weekMinuten: k.weekMinuten })),
        kandidaten: kandidaten.map((c) => ({ dienstId: c.dienstId, krachtId: c.krachtId, score: c.score })),
        instellingen: { maxWeekUren: i.maxWeekUren, rustUren: i.rustUren },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`planner antwoordde ${r.status}`);
    const antwoord = (await r.json()) as OrToolsAntwoord;
    if (!Array.isArray(antwoord.toewijzingen)) throw new Error("planner gaf geen toewijzingen");
    const per = new Map(kandidaten.map((c) => [`${c.dienstId}|${c.krachtId}`, c]));
    const naamVan = new Map(krachten.map((k) => [k.id, k.naam]));
    const toewijzingen: Toewijzing[] = antwoord.toewijzingen.flatMap((t) => {
      const c = per.get(`${t.dienstId}|${t.krachtId}`);
      return c ? [{ ...c, naam: naamVan.get(t.krachtId) ?? t.krachtId }] : [];
    });
    // wat open bleef, met de reden uit de interne analyse
    const intern = losOpIntern(diensten, krachten, i);
    const gevuld = new Map<string, number>();
    for (const t of toewijzingen) gevuld.set(t.dienstId, (gevuld.get(t.dienstId) ?? 0) + 1);
    const onvervuld = diensten
      .filter((d) => (gevuld.get(d.id) ?? 0) < d.plekken)
      .map((d) => ({ dienstId: d.id, open: d.plekken - (gevuld.get(d.id) ?? 0), reden: intern.onvervuld.find((o) => o.dienstId === d.id)?.reden ?? "geen kracht past" }));
    return { toewijzingen, onvervuld, totaal: totalen(toewijzingen, diensten), oplosser: "ortools", ms: Date.now() - t0 };
  } catch (err) {
    logger.warn("planner-dienst niet gebruikt, ingebouwde oplosser gebruikt", { reason: (err as Error).message });
    return losOpIntern(diensten, krachten, i);
  }
}

/** Is de OR-Tools-dienst ingesteld en bereikbaar? (Admin → Systeem) */
export async function plannerDienstStatus(): Promise<{ ingesteld: boolean; bereikbaar: boolean }> {
  const url = env.PLANNER_URL;
  if (!url) return { ingesteld: false, bereikbaar: false };
  try {
    const r = await fetch(`${url.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(2500) });
    return { ingesteld: true, bereikbaar: r.ok };
  } catch {
    return { ingesteld: true, bereikbaar: false };
  }
}
