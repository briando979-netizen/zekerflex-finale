import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { leesKeuze, voegToe, WERKRUIMTES, type Werkruimte, type WerkruimteKeuze } from "@/lib/werkgever/werkruimte";

// ---------------------------------------------------------------------------
// Wat de werkgevers-app per bedrijf moet weten, en de keuze bij het aanmelden bewaren (lib/werkgever/werkruimte.ts).
//   KV "werkruimte:<tenantId>"  — welke dashboards het bedrijf bij het aanmelden koos (bedrijfsgegevens, geen
//                                 persoonsgegevens). Sinds 22 nov 2026 (fase C) opent elk bedrijf in het dashboard
//                                 personeel; de keuze blijft alleen bewaard.
// Foutbestendig: een ontbrekende tabel of een storing mag het menu nooit breken; dan geldt "nog geen klussen".
// ---------------------------------------------------------------------------

const sleutel = (tenantId: string) => `werkruimte:${tenantId}`;

export interface WerkruimteContext {
  /** het bedrijf plaatste ooit een klus (het korte startmenu, lib/werkgever/werkruimte.ts NA_EERSTE_KLUS) */
  heeftKlussen: boolean;
}

/** Per verzoek één keer: de layout en het startscherm vragen hetzelfde. */
export const werkruimteVan = cache(async (tenantId: string | undefined): Promise<WerkruimteContext> => {
  if (!tenantId) return { heeftKlussen: false };
  const klus = await prisma.shift.findFirst({ where: { branch: { tenantId } }, select: { id: true } }).catch(() => null);
  return { heeftKlussen: Boolean(klus) };
});

/**
 * De keuze bij het aanmelden bewaren; het gekozen dashboard wordt het standaarddashboard. `ook` voegt er nog meer toe
 * (bijv. personeel).
 */
export async function voegDashboardToe(tenantId: string, soort: Werkruimte, ook: readonly Werkruimte[] = [], now = new Date()): Promise<WerkruimteKeuze> {
  const oud = await kvGet<unknown>(sleutel(tenantId)).then(leesKeuze).catch(() => null);
  const keuze = voegToe(oud, soort, now.toISOString());
  const lijst = new Set<Werkruimte>([...keuze.dashboards, ...ook]);
  const nieuw: WerkruimteKeuze = { ...keuze, ookPersoneel: lijst.has("personeel"), dashboards: WERKRUIMTES.filter((w) => lijst.has(w)) };
  await kvSet(sleutel(tenantId), nieuw);
  return nieuw;
}
