import { prisma } from "@/lib/prisma";
import { kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { hasRole, type Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { legeStand, type LocatieStand, type ModuleSleutel } from "@/lib/locatie/modules";

// ---------------------------------------------------------------------------
// Welke Op locatie-modules een bedrijf aan heeft (lib/locatie/modules.ts) en
// voor wie dit bedrijf is. Alles in de KV (geen migratie):
//   locatie:<tenantId>   de stand per module
// De modules zelf bewaren hun gegevens in eigen bestanden (toegang.ts, kluis.ts,
// printen.ts, portofoon.ts), elk met eigen sleutels.
// ---------------------------------------------------------------------------

const STAND = (t: string) => `locatie:${t}`;

export interface LocatieScope {
  tenantId: string;
  /** null = alle vestigingen van het bedrijf; anders alleen deze (een vestigingsbeheerder) */
  branchIds: string[] | null;
  /** modules aan/uit zetten, de kluis vullen, tokens maken: alleen de beheerder van het bedrijf */
  magBeheren: boolean;
}

/** Het bedrijf (en de vestigingen) waarvoor deze persoon Op locatie gebruikt. */
export async function locatieScope(p: Principal): Promise<LocatieScope> {
  const scope = await resolveEmployerScope(p);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.forbidden("Op locatie werkt alleen vanuit een bedrijfsaccount. Maak eerst je bedrijfsprofiel af.");
  return { tenantId, branchIds: scope.branchIds, magBeheren: hasRole(p, "HQ_ADMIN", "PLATFORM_ADMIN") };
}

export async function locatieStand(tenantId: string): Promise<LocatieStand> {
  const s = await kvGet<LocatieStand>(STAND(tenantId));
  return s && typeof s === "object" && s.modules ? { ...s, tenantId } : legeStand(tenantId);
}

export async function zetModule(tenantId: string, sleutel: ModuleSleutel, aan: boolean, door: { userId: string; naam: string }): Promise<LocatieStand> {
  const huidig = await locatieStand(tenantId);
  const now = new Date().toISOString();
  const nieuw: LocatieStand = {
    tenantId,
    modules: { ...huidig.modules, [sleutel]: { aan, sinds: now, door: door.userId, doorNaam: door.naam } },
    bijgewerkt: now,
  };
  await kvSet(STAND(tenantId), nieuw);
  return nieuw;
}

/** Alle bedrijven met een stand (voor het beheer). */
export async function alleStanden(): Promise<LocatieStand[]> {
  const rijen = await kvListEntries<LocatieStand>("locatie:", 5000);
  return rijen
    .filter((r) => r.value && typeof r.value === "object" && r.value.modules)
    .map((r) => ({ ...r.value, tenantId: r.key.slice("locatie:".length) }));
}

export interface Vestiging {
  id: string;
  naam: string;
  plaats: string;
  adres: string;
}

/** De vaste vestigingen van het bedrijf, eventueel alleen die van een vestigingsbeheerder. */
export async function vestigingenVan(tenantId: string, branchIds: string[] | null = null): Promise<Vestiging[]> {
  const rows = await prisma.branch.findMany({
    where: { tenantId, kind: "PERMANENT", ...(branchIds ? { id: { in: branchIds } } : {}) },
    select: { id: true, name: true, city: true, addressLine: true },
    orderBy: { name: "asc" },
  });
  return rows.map((b) => ({ id: b.id, naam: b.name, plaats: b.city, adres: b.addressLine }));
}

/** Een vestiging moet van dit bedrijf zijn (en binnen het bereik van de beheerder vallen). */
export async function eisVestiging(scope: LocatieScope, branchId: string): Promise<Vestiging> {
  if (scope.branchIds && !scope.branchIds.includes(branchId)) throw AppError.forbidden("Deze vestiging valt buiten je beheer.");
  const b = await prisma.branch.findFirst({ where: { id: branchId, tenantId: scope.tenantId }, select: { id: true, name: true, city: true, addressLine: true } });
  if (!b) throw AppError.notFound("Vestiging niet gevonden.");
  return { id: b.id, naam: b.name, plaats: b.city, adres: b.addressLine };
}

/** De beheerders die een melding over een vestiging horen te krijgen: HQ-beheerders en de vestigingsbeheerders ervan. */
export async function beheerdersVan(tenantId: string, branchId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: {
      tenantId,
      user: { disabledAt: null },
      OR: [{ role: "HQ_ADMIN" }, { role: "LOCAL_MANAGER", scopedBranches: { some: { branchId } } }],
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

export async function bedrijfsnaam(tenantId: string): Promise<string> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return t?.name ?? "je bedrijf";
}
