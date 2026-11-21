import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { requirePrincipal, type Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { listCounterOffers } from "@/lib/offers/store";
import { leesUitzendPartners } from "@/lib/uitzend/partners";
import {
  isOpen,
  isTeLaat,
  leesBureauGegevens,
  sorteerAanvragen,
  stapVan,
  werkdagenSinds,
  type AanvraagStap,
  type BureauGegevens,
  type VerloningDienst,
} from "@/lib/uitzend/bureau-kern";

// ---------------------------------------------------------------------------
// De gegevens van het dashboard van een uitzendpartner (/werkgever/uitzend, lib/uitzend/bureau-kern.ts).
// - Aanvragen: de reacties (lib/offers/store.ts) op klussen van het bureau. Contactgegevens alleen bij een open of
//   ingeplande aanvraag van ná het moment dat het bedrijf uitzendpartner werd: alleen dan gaf de werker toestemming.
// - Wat het bureau zelf bijhoudt (wie het al belde, de bureaugegevens) staat in KV "uitzendbureau:<tenantId>":
//   bedrijfsgegevens en reactie-id's, geen gegevens over een persoon.
// Een LOCAL_MANAGER ziet alleen de locaties die hij beheert (resolveEmployerScope).
// ---------------------------------------------------------------------------

const sleutel = (tenantId: string) => `uitzendbureau:${tenantId}`;

export interface BureauStand {
  /** reactie-id → wanneer het bureau de werker belde */
  gebeld: Record<string, string>;
  gegevens: BureauGegevens;
}

export interface BureauContext {
  principal: Principal;
  tenantId: string | null;
  /** het bedrijf is uitzendpartner; sinds (ISO) */
  partnerSinds: string | null;
  /** filter op de locaties die deze gebruiker mag zien */
  branchWhere: { tenantId: string; id?: { in: string[] } } | null;
}

/** Wie kijkt, voor welk bedrijf, en is dat een uitzendpartner? */
export async function bureauContext(): Promise<BureauContext> {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0] ?? null;
  if (!tenantId) return { principal, tenantId: null, partnerSinds: null, branchWhere: null };
  const partners = await leesUitzendPartners();
  const partnerSinds = Object.hasOwn(partners, tenantId) ? (partners[tenantId] ?? null) : null;
  return { principal, tenantId, partnerSinds, branchWhere: scope.branchIds ? { tenantId, id: { in: scope.branchIds } } : { tenantId } };
}

export async function leesBureauStand(tenantId: string): Promise<BureauStand> {
  const ruw = (await kvGet<Record<string, unknown>>(sleutel(tenantId)).catch(() => null)) ?? {};
  const gebeld: Record<string, string> = {};
  if (ruw.gebeld && typeof ruw.gebeld === "object") {
    for (const [id, op] of Object.entries(ruw.gebeld as Record<string, unknown>)) if (typeof op === "string") gebeld[id] = op;
  }
  return { gebeld, gegevens: leesBureauGegevens(ruw.gegevens) };
}

async function schrijfBureauStand(tenantId: string, stand: BureauStand): Promise<void> {
  await kvSet(sleutel(tenantId), stand);
}

export async function zetGebeld(tenantId: string, offerId: string, gebeld: boolean, nu: Date = new Date()): Promise<BureauStand> {
  const stand = await leesBureauStand(tenantId);
  const lijst = { ...stand.gebeld };
  if (gebeld) lijst[offerId] = nu.toISOString();
  else delete lijst[offerId];
  // niet eindeloos groeien: de nieuwste 2000 markeringen
  const kort = Object.fromEntries(Object.entries(lijst).sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, 2000));
  const nieuw = { ...stand, gebeld: kort };
  await schrijfBureauStand(tenantId, nieuw);
  return nieuw;
}

export async function zetBureauGegevens(tenantId: string, gegevens: BureauGegevens): Promise<BureauStand> {
  const stand = await leesBureauStand(tenantId);
  const nieuw = { ...stand, gegevens };
  await schrijfBureauStand(tenantId, nieuw);
  return nieuw;
}

// --- aanvragen ------------------------------------------------------------------

export interface AanvraagRij {
  offerId: string;
  at: string;
  stap: AanvraagStap;
  teLaat: boolean;
  werkdagen: number;
  werker: { naam: string; email: string | null; telefoon: string | null; idGecontroleerd: boolean };
  klus: { id: string; titel: string; startsAt: string; endsAt: string; locatie: string; uurloonCents: number };
}

/** Alle aanvragen op klussen van dit bureau: open eerst (oudste bovenaan), daarna de rest. */
export async function aanvragenVan(ctx: BureauContext, nu: Date = new Date()): Promise<AanvraagRij[]> {
  if (!ctx.tenantId || !ctx.branchWhere) return [];
  const reacties = await listCounterOffers(2000);
  const klusIds = [...new Set(reacties.map((r) => r.shiftId))];
  if (klusIds.length === 0) return [];
  const klussen = await prisma.shift.findMany({
    where: { id: { in: klusIds }, branch: ctx.branchWhere },
    select: { id: true, title: true, startsAt: true, endsAt: true, hourlyRateCents: true, branch: { select: { name: true, city: true } } },
  });
  const klusOp = new Map(klussen.map((k) => [k.id, k]));
  const eigen = reacties.filter((r) => klusOp.has(r.shiftId));
  const werkers = await prisma.user.findMany({
    where: { id: { in: [...new Set(eigen.map((r) => r.userId))] } },
    select: { id: true, fullName: true, email: true, phone: true, kycStatus: true },
  });
  const werkerOp = new Map(werkers.map((w) => [w.id, w]));
  const { gebeld } = await leesBureauStand(ctx.tenantId);
  const rijen = eigen.flatMap((r): AanvraagRij[] => {
    const k = klusOp.get(r.shiftId);
    if (!k) return [];
    const w = werkerOp.get(r.userId);
    const stap = stapVan(r.status, gebeld[r.id]);
    // toestemming om contactgegevens te delen gaf de werker alleen bij een aanvraag op een klus van een uitzendpartner
    const metToestemming = Boolean(ctx.partnerSinds && r.at >= ctx.partnerSinds) && (isOpen(stap) || stap === "ingepland");
    const at = new Date(r.at);
    return [
      {
        offerId: r.id,
        at: r.at,
        stap,
        teLaat: isTeLaat(stap, at, nu),
        werkdagen: werkdagenSinds(at, nu),
        werker: {
          naam: w?.fullName ?? r.freelancerName,
          email: metToestemming ? (w?.email ?? null) : null,
          telefoon: metToestemming ? (w?.phone ?? null) : null,
          idGecontroleerd: w?.kycStatus === "VERIFIED",
        },
        klus: {
          id: k.id,
          titel: k.title,
          startsAt: k.startsAt.toISOString(),
          endsAt: k.endsAt.toISOString(),
          locatie: [k.branch.name, k.branch.city].filter(Boolean).join(", "),
          uurloonCents: k.hourlyRateCents,
        },
      },
    ];
  });
  return sorteerAanvragen(rijen).slice(0, 500);
}

/** Hoort deze reactie bij een klus van dit bureau (en de locaties die de gebruiker ziet)? */
export async function isEigenAanvraag(ctx: BureauContext, offerId: string): Promise<boolean> {
  if (!ctx.branchWhere) return false;
  const r = (await listCounterOffers(2000)).find((o) => o.id === offerId);
  if (!r) return false;
  const k = await prisma.shift.findFirst({ where: { id: r.shiftId, branch: ctx.branchWhere }, select: { id: true } });
  return Boolean(k);
}

// --- uitzendkrachten ------------------------------------------------------------

export interface KrachtRij {
  werkerId: string;
  naam: string;
  email: string;
  telefoon: string | null;
  idGecontroleerd: boolean;
  klussen: number;
  volgende: { titel: string; startsAt: string; locatie: string } | null;
  laatste: { titel: string; startsAt: string } | null;
  goedgekeurdMinuten: number;
  wachtMinuten: number;
}

/** Iedereen die het bureau op een klus inplande (niet geannuleerd), met de klussen en uren bij dit bureau. */
export async function krachtenVan(ctx: BureauContext, nu: Date = new Date()): Promise<KrachtRij[]> {
  if (!ctx.branchWhere) return [];
  const toewijzingen = await prisma.shiftAssignment.findMany({
    where: { cancelledAt: null, shift: { branch: ctx.branchWhere } },
    select: {
      shift: { select: { title: true, startsAt: true, branch: { select: { name: true } } } },
      timesheet: { select: { billableMinutes: true, status: true } },
      freelancer: { select: { id: true, user: { select: { fullName: true, email: true, phone: true, kycStatus: true } } } },
    },
    orderBy: { acceptedAt: "desc" },
    take: 5000,
  });
  const per = new Map<string, KrachtRij>();
  for (const t of toewijzingen) {
    const id = t.freelancer.id;
    const rij =
      per.get(id) ??
      ({
        werkerId: id,
        naam: t.freelancer.user.fullName,
        email: t.freelancer.user.email,
        telefoon: t.freelancer.user.phone,
        idGecontroleerd: t.freelancer.user.kycStatus === "VERIFIED",
        klussen: 0,
        volgende: null,
        laatste: null,
        goedgekeurdMinuten: 0,
        wachtMinuten: 0,
      } satisfies KrachtRij);
    rij.klussen += 1;
    const start = t.shift.startsAt;
    if (start >= nu) {
      if (!rij.volgende || start.toISOString() < rij.volgende.startsAt) rij.volgende = { titel: t.shift.title, startsAt: start.toISOString(), locatie: t.shift.branch.name };
    } else if (!rij.laatste || start.toISOString() > rij.laatste.startsAt) {
      rij.laatste = { titel: t.shift.title, startsAt: start.toISOString() };
    }
    if (t.timesheet?.status === "APPROVED" || t.timesheet?.status === "PAID") rij.goedgekeurdMinuten += t.timesheet.billableMinutes;
    if (t.timesheet?.status === "SUBMITTED") rij.wachtMinuten += t.timesheet.billableMinutes;
    per.set(id, rij);
  }
  return [...per.values()].sort((a, b) => {
    // eerst wie een volgende klus heeft (de eerstvolgende bovenaan), dan de rest op naam
    if (a.volgende && b.volgende) return a.volgende.startsAt < b.volgende.startsAt ? -1 : 1;
    if (a.volgende) return -1;
    if (b.volgende) return 1;
    return a.naam.localeCompare(b.naam, "nl");
  });
}

// --- verloning ------------------------------------------------------------------

/** Goedgekeurde diensten in [van, tot), en hoeveel er in die periode nog op goedkeuring wachten. */
export async function verloningVan(ctx: BureauContext, van: Date, tot: Date): Promise<{ diensten: VerloningDienst[]; wachten: number }> {
  if (!ctx.branchWhere) return { diensten: [], wachten: 0 };
  const [rijen, wachten] = await Promise.all([
    prisma.timesheet.findMany({
      where: { branch: ctx.branchWhere, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: van, lt: tot } },
      select: {
        freelancerId: true,
        scheduledStart: true,
        scheduledEnd: true,
        actualStart: true,
        actualEnd: true,
        breakMinutes: true,
        billableMinutes: true,
        hourlyRateCents: true,
        branch: { select: { name: true } },
        assignment: { select: { shift: { select: { title: true } } } },
        freelancer: { select: { user: { select: { fullName: true, email: true } } } },
      },
      orderBy: { scheduledStart: "asc" },
      take: 20000,
    }),
    prisma.timesheet.count({ where: { branch: ctx.branchWhere, status: { in: ["DRAFT", "SUBMITTED", "DISPUTED"] }, scheduledStart: { gte: van, lt: tot } } }),
  ]);
  const diensten = rijen.map(
    (r): VerloningDienst => ({
      werkerId: r.freelancerId,
      naam: r.freelancer.user.fullName,
      email: r.freelancer.user.email,
      locatie: r.branch.name,
      klus: r.assignment.shift.title,
      begin: r.actualStart ?? r.scheduledStart,
      eind: r.actualEnd ?? r.scheduledEnd,
      pauzeMinuten: r.breakMinutes,
      minuten: r.billableMinutes,
      uurloonCents: r.hourlyRateCents,
    }),
  );
  return { diensten, wachten };
}

// --- klanten en locaties ------------------------------------------------------------

export interface LocatieRij {
  id: string;
  naam: string;
  adres: string;
  vast: boolean;
  komendeKlussen: number;
  openPlekken: number;
  urenAfgelopen4Weken: number;
}

/** De locaties van het bureau (vaste en die bij een losse klus zijn aangemaakt) met de klussen en uren erbij. */
export async function locatiesVan(ctx: BureauContext, nu: Date = new Date()): Promise<LocatieRij[]> {
  if (!ctx.branchWhere) return [];
  const sinds = new Date(nu.getTime() - 28 * 864e5);
  const [locaties, klussen, uren] = await Promise.all([
    prisma.branch.findMany({
      where: ctx.branchWhere,
      select: { id: true, name: true, addressLine: true, postalCode: true, city: true, kind: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.shift.findMany({
      where: { branch: ctx.branchWhere, startsAt: { gte: nu }, status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED", "FILLED"] } },
      select: { branchId: true, positions: true, assignments: { where: { cancelledAt: null }, select: { id: true } } },
      take: 5000,
    }),
    prisma.timesheet.groupBy({
      by: ["branchId"],
      where: { branch: ctx.branchWhere, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: sinds, lt: nu } },
      _sum: { billableMinutes: true },
    }),
  ]);
  const urenOp = new Map(uren.map((u) => [u.branchId, (u._sum.billableMinutes ?? 0) / 60]));
  return locaties.map((l) => {
    const eigen = klussen.filter((k) => k.branchId === l.id);
    return {
      id: l.id,
      naam: l.name,
      adres: [l.addressLine, [l.postalCode, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      vast: l.kind === "PERMANENT",
      komendeKlussen: eigen.length,
      openPlekken: eigen.reduce((n, k) => n + Math.max(0, k.positions - k.assignments.length), 0),
      urenAfgelopen4Weken: Math.round((urenOp.get(l.id) ?? 0) * 10) / 10,
    };
  });
}
