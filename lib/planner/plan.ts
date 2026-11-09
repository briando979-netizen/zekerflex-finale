import { randomUUID } from "node:crypto";
import { MatchStatus, ShiftStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { certsRequiredForShift } from "@/lib/certificates/matching";
import { getEmployerRelations } from "@/lib/employer/relations";
import { isMatchEligibleWorker } from "@/lib/matching/engine";
import { loadWorkerPrefs } from "@/lib/matching/worker-prefs";
import { resolveMatchingConfig } from "@/lib/matching/score";
import { enqueueShiftMatching } from "@/lib/notifications/dispatcher";
import type { EmployerScope } from "@/lib/dashboard/employer";
import { losOp } from "@/lib/planner/service";
import { planWeek } from "@/lib/planner/week";
import { berekenDrukte, DRUKTE_WEKEN, type WeekDrukte } from "@/lib/planner/drukte";
import { STANDAARD_INSTELLINGEN, type PlanDienst, type PlanInstellingen, type PlanKracht, type PlanResultaat } from "@/lib/planner/solver";

/** Alleen een dienst die nog open staat, krijgt een voorstel uit de planner. */
const OPEN_STATUSSEN: ShiftStatus[] = [ShiftStatus.OPEN, ShiftStatus.MATCHING, ShiftStatus.PARTIALLY_FILLED];

// ---------------------------------------------------------------------------
// De roosterplanner voor een werkgever: open diensten van één week + de krachten
// die ze mogen doen → een voorstel (lib/planner/solver via service.ts). Het
// voorstel staat in KV planner:<tenantId>:<week>; "versturen" maakt er echte
// aanbiedingen van via de bestaande golf-dispatcher, zodat de kracht gewoon in
// de app accepteert of afslaat. De planner plant dus nooit iemand in zonder
// diens ja.
// ---------------------------------------------------------------------------

export interface VoorstelDienst {
  id: string;
  titel: string;
  locatie: string;
  start: string;
  einde: string;
  plekken: number;
  uurtariefCents: number;
  certificaten: string[];
}

export interface PlanVoorstel {
  id: string;
  tenantId: string;
  week: string;
  at: string;
  door: string;
  instellingen: PlanInstellingen;
  resultaat: PlanResultaat;
  diensten: VoorstelDienst[];
  krachten: number;
  verstuurd?: { at: string; door: string; aanbiedingen: number; diensten: number };
}

const KEY = (tenantId: string, week: string) => `planner:${tenantId}:${week}`;
const MAX_KRACHTEN = 400;
const DAG = 86_400_000;

export async function leesVoorstel(tenantId: string, week: string): Promise<PlanVoorstel | null> {
  return kvGet<PlanVoorstel>(KEY(tenantId, week));
}

function branchFilter(scope: EmployerScope): Prisma.BranchWhereInput {
  return scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
}

async function laadDiensten(scope: EmployerScope, van: Date, tot: Date): Promise<PlanDienst[]> {
  const shifts = await prisma.shift.findMany({
    where: {
      branch: branchFilter(scope),
      status: { in: [ShiftStatus.OPEN, ShiftStatus.MATCHING, ShiftStatus.PARTIALLY_FILLED] },
      startsAt: { gte: van, lt: tot },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      positions: true,
      hourlyRateCents: true,
      requiredSkillId: true,
      requiredSkill: { select: { name: true } },
      branch: { select: { name: true, latitude: true, longitude: true } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 300,
  });
  return shifts.flatMap((s) => {
    const plekken = s.positions - s._count.assignments;
    if (plekken <= 0) return [];
    return [
      {
        id: s.id,
        titel: s.title,
        locatie: s.branch.name,
        start: s.startsAt.getTime(),
        einde: s.endsAt.getTime(),
        pauzeMinuten: s.breakMinutes,
        plekken,
        uurtariefCents: s.hourlyRateCents,
        lat: s.branch.latitude,
        lng: s.branch.longitude,
        certificaten: certsRequiredForShift(s.title, s.requiredSkill?.name ?? null)
          .filter((c) => c.required)
          .map((c) => c.type),
        skillId: s.requiredSkillId,
      },
    ];
  });
}

async function laadKrachten(tenantId: string, van: Date, tot: Date): Promise<PlanKracht[]> {
  const now = new Date();
  const [profiles, relaties] = await Promise.all([
    prisma.freelancerProfile.findMany({
      where: {
        isBlacklisted: false,
        user: { kycStatus: "VERIFIED", disabledAt: null },
        OR: [{ matchingBlockedUntil: null }, { matchingBlockedUntil: { lte: now } }],
      },
      select: {
        id: true,
        userId: true,
        homeLatitude: true,
        homeLongitude: true,
        reliabilityScore: true,
        vatValid: true,
        kvkValid: true,
        country: true,
        user: { select: { fullName: true } },
        skills: { select: { skillId: true } },
        assignments: {
          where: { cancelledAt: null, shift: { startsAt: { gte: new Date(van.getTime() - DAG) }, endsAt: { lte: new Date(tot.getTime() + DAG) } } },
          select: { shift: { select: { startsAt: true, endsAt: true, breakMinutes: true } } },
        },
      },
      orderBy: { reliabilityScore: "desc" },
      take: MAX_KRACHTEN,
    }),
    getEmployerRelations(tenantId),
  ]);
  const geblokkeerd = new Set(relaties.blocked.map((b) => b.userId));
  const favoriet = new Set(relaties.favorites.map((f) => f.userId));
  const kandidaten = profiles.filter((p) => !geblokkeerd.has(p.userId));
  const checks = await Promise.all(kandidaten.map((p) => isMatchEligibleWorker(p, false).catch(() => false)));
  const geschikt = kandidaten.filter((_, i) => checks[i]);
  const userIds = geschikt.map((p) => p.userId);
  const [certs, prefs] = await Promise.all([
    prisma.certificate.findMany({
      where: { userId: { in: userIds }, status: "VALID", OR: [{ expiresOn: null }, { expiresOn: { gte: now } }] },
      select: { userId: true, type: true },
    }),
    loadWorkerPrefs(userIds).catch(() => new Map()),
  ]);
  const certsVan = new Map<string, string[]>();
  for (const c of certs) certsVan.set(c.userId, [...(certsVan.get(c.userId) ?? []), c.type]);

  return geschikt.map((p) => {
    const pref = prefs.get(p.userId);
    const bezet = p.assignments.map((a) => ({ start: a.shift.startsAt.getTime(), einde: a.shift.endsAt.getTime() }));
    const weekMinuten = p.assignments
      .filter((a) => a.shift.startsAt >= van && a.shift.startsAt < tot)
      .reduce((s, a) => s + Math.max(0, Math.round((a.shift.endsAt.getTime() - a.shift.startsAt.getTime()) / 60_000) - a.shift.breakMinutes), 0);
    return {
      id: p.id,
      naam: p.user.fullName,
      lat: p.homeLatitude,
      lng: p.homeLongitude,
      certificaten: certsVan.get(p.userId) ?? [],
      skillIds: p.skills.map((s) => s.skillId),
      betrouwbaarheid: p.reliabilityScore,
      bezet,
      weekMinuten,
      ...(pref?.maxTravelMinutes ? { maxReisMinuten: pref.maxTravelMinutes } : {}),
      ...(pref?.minHourlyRateCents ? { minUurtariefCents: pref.minHourlyRateCents } : {}),
      ...(favoriet.has(p.userId) ? { favoriet: true } : {}),
    };
  });
}

export function leesInstellingen(raw: unknown): PlanInstellingen {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number, std: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : std);
  const voorkeur = r.voorkeur === "kosten" || r.voorkeur === "betrouwbaarheid" ? r.voorkeur : "balans";
  return {
    maxReisKm: num(r.maxReisKm, 5, 150, STANDAARD_INSTELLINGEN.maxReisKm),
    maxWeekUren: num(r.maxWeekUren, 8, 60, STANDAARD_INSTELLINGEN.maxWeekUren),
    rustUren: num(r.rustUren, 8, 16, STANDAARD_INSTELLINGEN.rustUren),
    voorkeur,
    reiskostenPerKmCents: num(r.reiskostenPerKmCents, 0, 100, STANDAARD_INSTELLINGEN.reiskostenPerKmCents),
  };
}

/** Verwachte drukte voor een week uit de eigen diensten van de weken ervoor (lib/planner/drukte.ts). */
export async function leesDrukte(scope: EmployerScope, week: string): Promise<WeekDrukte | null> {
  const w = planWeek(week);
  if (!w) return null;
  const shifts = await prisma.shift.findMany({
    where: {
      branch: branchFilter(scope),
      status: { notIn: [ShiftStatus.DRAFT, ShiftStatus.CANCELLED] },
      // een dag extra marge: berekenDrukte telt zelf op Nederlandse kalenderdagen
      startsAt: { gte: new Date(w.van.getTime() - (DRUKTE_WEKEN * 7 + 1) * 86_400_000), lt: w.tot },
    },
    select: { startsAt: true, positions: true },
    take: 5000,
  });
  return berekenDrukte(shifts.map((s) => ({ start: s.startsAt, plekken: s.positions })), w.van);
}

/** Reken het rooster voor een week uit en bewaar het als voorstel. */
export async function berekenVoorstel(args: { tenantId: string; scope: EmployerScope; week: string; instellingen: PlanInstellingen; door: string }): Promise<PlanVoorstel> {
  const w = planWeek(args.week);
  if (!w) throw AppError.validation("Onbekende week");
  const diensten = await laadDiensten(args.scope, w.van, w.tot);
  const krachten = diensten.length ? await laadKrachten(args.tenantId, w.van, w.tot) : [];
  const resultaat = await losOp(diensten, krachten, args.instellingen);
  const voorstel: PlanVoorstel = {
    id: randomUUID().slice(0, 12),
    tenantId: args.tenantId,
    week: w.sleutel,
    at: new Date().toISOString(),
    door: args.door,
    instellingen: args.instellingen,
    resultaat,
    diensten: diensten.map((d) => ({
      id: d.id,
      titel: d.titel,
      locatie: d.locatie,
      start: new Date(d.start).toISOString(),
      einde: new Date(d.einde).toISOString(),
      plekken: d.plekken,
      uurtariefCents: d.uurtariefCents,
      certificaten: d.certificaten,
    })),
    krachten: krachten.length,
  };
  await kvSet(KEY(args.tenantId, w.sleutel), voorstel);
  logger.info("planner voorstel", { tenantId: args.tenantId, week: w.sleutel, diensten: diensten.length, krachten: krachten.length, gevuld: resultaat.totaal.gevuld, oplosser: resultaat.oplosser, ms: resultaat.ms });
  return voorstel;
}

/**
 * Maak van het voorstel echte aanbiedingen: per dienst één golf naar de gekozen
 * krachten (bestaande dispatcher: push + aanbod in de app, verloopt vanzelf).
 * `keuze` beperkt het tot die paren; zonder keuze gaat alles.
 */
export async function verstuurVoorstel(args: { tenantId: string; week: string; door: string; keuze?: { dienstId: string; krachtId: string }[] }): Promise<{ aanbiedingen: number; diensten: number; overgeslagen: string[] }> {
  const voorstel = await leesVoorstel(args.tenantId, args.week);
  if (!voorstel) throw AppError.notFound("Geen voorstel voor deze week; bereken eerst een rooster.");
  const gekozen = new Set((args.keuze ?? voorstel.resultaat.toewijzingen).map((k) => `${k.dienstId}|${k.krachtId}`));
  const perDienst = new Map<string, typeof voorstel.resultaat.toewijzingen>();
  for (const t of voorstel.resultaat.toewijzingen) {
    if (!gekozen.has(`${t.dienstId}|${t.krachtId}`)) continue;
    perDienst.set(t.dienstId, [...(perDienst.get(t.dienstId) ?? []), t]);
  }

  let aanbiedingen = 0;
  let diensten = 0;
  const overgeslagen: string[] = [];
  for (const [shiftId, rijen] of perDienst) {
    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, branch: { tenantId: args.tenantId } },
      select: { id: true, title: true, status: true, positions: true, branch: { select: { matchingConfig: true } }, assignments: { where: { cancelledAt: null }, select: { freelancerId: true } } },
    });
    if (!shift || !OPEN_STATUSSEN.includes(shift.status)) {
      overgeslagen.push(`${rijen[0]?.dienstId ?? shiftId}: dienst is niet meer open`);
      continue;
    }
    const open = shift.positions - shift.assignments.length;
    if (open <= 0) {
      overgeslagen.push(`${shift.title}: al vol`);
      continue;
    }
    const alIngepland = new Set(shift.assignments.map((a) => a.freelancerId));
    const golf = rijen.filter((r) => !alIngepland.has(r.krachtId)).slice(0, open);
    if (golf.length === 0) continue;
    for (const r of golf) {
      await prisma.shiftMatch.upsert({
        where: { shiftId_freelancerId: { shiftId, freelancerId: r.krachtId } },
        create: {
          shiftId,
          freelancerId: r.krachtId,
          score: 0.9,
          scoreBreakdown: { planner: true, score: r.score, reisKm: r.reisKm } as unknown as Prisma.InputJsonValue,
          travelMode: "DRIVING",
          travelMinutes: r.reisMinuten,
          distanceMeters: Math.round(r.reisKm * 1000),
          withinGeofence: false,
          status: MatchStatus.SCORED,
        },
        update: { status: MatchStatus.SCORED, respondedAt: null, expiresAt: null },
      });
    }
    const config = resolveMatchingConfig(shift.branch.matchingConfig);
    const n = await enqueueShiftMatching(
      shiftId,
      golf.map((r) => ({ freelancerId: r.krachtId, score: 0.9, travelMinutes: r.reisMinuten, travelMode: "DRIVING" as const })),
      { waveSize: golf.length, offerTtlMinutes: Math.max(config.offerTtlMinutes, 120), seats: open },
    );
    aanbiedingen += n;
    diensten += 1;
    if (shift.status === ShiftStatus.OPEN) await prisma.shift.update({ where: { id: shiftId }, data: { status: ShiftStatus.MATCHING } });
  }

  voorstel.verstuurd = { at: new Date().toISOString(), door: args.door, aanbiedingen, diensten };
  await kvSet(KEY(args.tenantId, args.week), voorstel);
  await recordAudit({
    category: "MATCHING",
    action: "planner.offers.sent",
    actorUserId: args.door,
    actorLabel: "user",
    summary: `Roosterplanner: ${aanbiedingen} aanbiedingen voor ${diensten} diensten (${args.week})`,
    targetType: "tenant",
    targetId: args.tenantId,
    metadata: { week: args.week, aanbiedingen, diensten, overgeslagen: overgeslagen.length },
  });
  return { aanbiedingen, diensten, overgeslagen };
}
