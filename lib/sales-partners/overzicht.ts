import { prisma } from "@/lib/prisma";
import { zonderTestklussen } from "@/lib/shifts/testklus-db";
import { alleBedrijven, bedrijvenVan, leesSalesPartnersVers } from "@/lib/sales-partners/store";
import { berekenBedrijf, partnerKpi, type BedrijfUitkomst, type Dienst, type PartnerBedrijf, type PartnerKpi } from "@/lib/sales-partners/model";

// ---------------------------------------------------------------------------
// Uren en commissie van sales partners (rekenregels: lib/sales-partners/model.ts). De uren komen uit de goedgekeurde
// diensten (Timesheet APPROVED of PAID) van de gekoppelde bedrijfsaccounts, zonder testklussen; "betaald" is een dienst
// waarvan de platformfactuur betaald is of € 0 was (de gratis eerste maand).
// ---------------------------------------------------------------------------

/** De goedgekeurde diensten van deze bedrijven vanaf `sinds`. */
export async function dienstenVan(tenantIds: readonly string[], sinds: Date): Promise<Dienst[]> {
  if (!tenantIds.length) return [];
  const sheets = await prisma.timesheet.findMany({
    where: {
      status: { in: ["APPROVED", "PAID"] },
      branch: { tenantId: { in: [...tenantIds] } },
      scheduledStart: { gte: sinds },
      assignment: { shift: await zonderTestklussen(sinds) },
    },
    select: { id: true, scheduledStart: true, billableMinutes: true, branch: { select: { tenantId: true } } },
  });
  if (!sheets.length) return [];
  const facturen = await prisma.invoice.findMany({
    where: { type: "PLATFORM_FEE", timesheetId: { in: sheets.map((s) => s.id) } },
    select: { timesheetId: true, status: true, totalCents: true },
  });
  const betaald = new Set(facturen.filter((f) => f.status === "PAID" || (f.totalCents === 0 && f.status === "ISSUED")).map((f) => f.timesheetId));
  return sheets.map((s) => ({ tenantId: s.branch.tenantId, start: s.scheduledStart.toISOString(), minuten: s.billableMinutes, betaald: betaald.has(s.id) }));
}

export interface BedrijfRij {
  partnerId: string;
  bedrijf: PartnerBedrijf;
  uitkomst: BedrijfUitkomst;
}

/** Rekent een lijst registraties door met één databasevraag voor alle gekoppelde bedrijven. */
async function doorrekenen(regs: readonly { partnerId: string; bedrijf: PartnerBedrijf }[]): Promise<BedrijfRij[]> {
  const gekoppeld = regs.filter((r) => r.bedrijf.tenantId && !r.bedrijf.afgewezenOp);
  const tenantIds = [...new Set(gekoppeld.map((r) => r.bedrijf.tenantId as string))];
  const vroegst = gekoppeld.reduce((m, r) => Math.min(m, Date.parse(r.bedrijf.aangemaaktOp)), Date.now());
  const diensten = await dienstenVan(tenantIds, new Date(vroegst));
  return regs.map((r) => ({ ...r, uitkomst: berekenBedrijf(r.bedrijf, diensten) }));
}

/** Het partnerdashboard van één partner. */
export async function partnerOverzicht(userId: string): Promise<{ rijen: BedrijfRij[]; kpi: PartnerKpi }> {
  const rijen = await doorrekenen((await bedrijvenVan(userId)).map((bedrijf) => ({ partnerId: userId, bedrijf })));
  return { rijen, kpi: partnerKpi(rijen.map((r) => r.uitkomst)) };
}

export interface PartnerSamenvatting {
  userId: string;
  naam: string;
  email: string;
  sinds: string;
  kpi: PartnerKpi;
}

/** Voor het beheer: alle partners met hun tellers, en alle registraties. */
export async function beheerOverzicht(): Promise<{ partners: PartnerSamenvatting[]; rijen: BedrijfRij[] }> {
  const set = await leesSalesPartnersVers();
  const ids = Object.keys(set);
  const [mensen, rijen] = await Promise.all([
    ids.length ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } }) : Promise.resolve([]),
    alleBedrijven().then(doorrekenen),
  ]);
  const wie = new Map(mensen.map((m) => [m.id, m]));
  const partners = ids
    .map((userId) => ({
      userId,
      naam: wie.get(userId)?.fullName ?? "(account bestaat niet meer)",
      email: wie.get(userId)?.email ?? "",
      sinds: set[userId] ?? "",
      kpi: partnerKpi(rijen.filter((r) => r.partnerId === userId).map((r) => r.uitkomst)),
    }))
    .sort((a, b) => b.kpi.verdiendCents - a.kpi.verdiendCents || a.naam.localeCompare(b.naam, "nl"));
  return { partners, rijen };
}
