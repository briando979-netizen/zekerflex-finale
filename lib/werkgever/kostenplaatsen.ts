import type { ShiftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgProfileExtra, saveOrgProfileExtra } from "@/lib/profile/store";
import {
  hernoemKostenplaats,
  leesKostenplaatsen,
  verwijderKostenplaats,
  voegKostenplaatsToe,
  type KostenplaatsUitkomst,
} from "@/lib/werkgever/kostenplaatsen-kern";

// ---------------------------------------------------------------------------
// Kostenplaatsen / PO-nummers van een bedrijf, server-kant (regels: lib/werkgever/kostenplaatsen-kern.ts). De lijst staat in
// OrgProfileExtra.costCentres (KV, geen schemawijziging); de gebruikers ervan zijn Branch.costCenter (de standaard van een
// vestiging) en Shift.kostenplaats (de keuze bij het uitzetten van een klus).
// ---------------------------------------------------------------------------

/**
 * Een klus telt als "in gebruik" zolang hij nog gepland staat of loopt. Een afgeronde of geannuleerde klus houdt zijn naam als
 * geschiedenis (op de factuur en in de export); die hoeft de lijst niet te blokkeren.
 */
const LOPENDE_KLUSSEN: ShiftStatus[] = ["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED", "FILLED", "IN_PROGRESS"];

export interface KostenplaatsRij {
  naam: string;
  /** hoeveel vestigingen en lopende klussen deze kostenplaats nu gebruiken */
  gebruik: number;
}

/** Per kostenplaats: bij hoeveel vestigingen (standaard) en lopende klussen van dit bedrijf staat hij. */
export async function kostenplaatsGebruik(tenantId: string, namen: readonly string[]): Promise<Map<string, number>> {
  const uit = new Map<string, number>(namen.map((n): [string, number] => [n, 0]));
  if (namen.length === 0) return uit;
  const lijst = [...namen];
  const [vestigingen, klussen] = await Promise.all([
    prisma.branch.groupBy({ by: ["costCenter"], where: { tenantId, costCenter: { in: lijst } }, _count: { _all: true } }),
    prisma.shift.groupBy({
      by: ["kostenplaats"],
      where: { kostenplaats: { in: lijst }, status: { in: LOPENDE_KLUSSEN }, branch: { tenantId } },
      _count: { _all: true },
    }),
  ]);
  for (const v of vestigingen) if (v.costCenter) uit.set(v.costCenter, (uit.get(v.costCenter) ?? 0) + v._count._all);
  for (const k of klussen) if (k.kostenplaats) uit.set(k.kostenplaats, (uit.get(k.kostenplaats) ?? 0) + k._count._all);
  return uit;
}

/** De lijst van dit bedrijf met per kostenplaats het gebruik. */
export async function lijstKostenplaatsen(tenantId: string): Promise<KostenplaatsRij[]> {
  const namen = leesKostenplaatsen((await getOrgProfileExtra(tenantId)).costCentres);
  const gebruik = await kostenplaatsGebruik(tenantId, namen);
  return namen.map((naam) => ({ naam, gebruik: gebruik.get(naam) ?? 0 }));
}

/** Slaat de nieuwe lijst op als de regels het toelaten; geeft in elk geval de uitkomst terug. */
async function wijzig(tenantId: string, maak: (lijst: string[], gebruik: Map<string, number>) => KostenplaatsUitkomst): Promise<KostenplaatsUitkomst> {
  const lijst = leesKostenplaatsen((await getOrgProfileExtra(tenantId)).costCentres);
  const gebruik = await kostenplaatsGebruik(tenantId, lijst);
  const uitkomst = maak(lijst, gebruik);
  if (uitkomst.ok) await saveOrgProfileExtra(tenantId, { costCentres: uitkomst.lijst });
  return uitkomst;
}

export const voegKostenplaatsToeVoor = (tenantId: string, naam: unknown) => wijzig(tenantId, (lijst) => voegKostenplaatsToe(lijst, naam));

export const hernoemKostenplaatsVoor = (tenantId: string, oud: string, naam: unknown) =>
  wijzig(tenantId, (lijst, gebruik) => hernoemKostenplaats(lijst, oud, naam, gebruik.get(oud) ?? 0));

export const verwijderKostenplaatsVoor = (tenantId: string, naam: string) =>
  wijzig(tenantId, (lijst, gebruik) => verwijderKostenplaats(lijst, naam, gebruik.get(naam) ?? 0));
