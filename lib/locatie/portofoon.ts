import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { AppError } from "@/lib/errors";
import { hasRole, type Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { ensureGroupThread, getGroupThreadByCommunity, type ChatThread } from "@/lib/messaging/store";
import { kanaalId, leesKanaalId, type KanaalSoort } from "@/lib/locatie/modules";
import { locatieStand } from "@/lib/locatie/store";

export { biedtAan, kanaalId, leesKanaalId } from "@/lib/locatie/modules";

// ---------------------------------------------------------------------------
// De portofoon: een spraakkanaal per klus en per vestiging. De spraak gaat
// rechtstreeks tussen de telefoons (WebRTC, met coturn als tussenstation,
// net als bellen in de chat); hier doen we alleen wie-is-er en het doorgeven
// van de verbindingsgegevens, in Redis met korte levensduur:
//   ptt:<kanaal>:lid:<userId>   JSON {naam, rol, apparaat} (EX 25 s, vernieuwd door de heartbeat)
//   ptt:<kanaal>:in:<userId>    lijst met verbindingsberichten voor deze persoon (EX 120 s)
//   ptt:<kanaal>:spreker        wie nu praat (EX 4 s)
// Een kanaal heeft ook een groepsgesprek in de chat voor spraakberichten als
// iemand even niet verbonden is (ensureGroupThread, communityId "ptt:<kanaal>").
// ---------------------------------------------------------------------------

export interface Kanaal {
  id: string;
  soort: KanaalSoort;
  titel: string;
  ondertitel: string;
  tenantId: string;
  branchId: string;
  shiftId?: string;
  /** van/tot (ISO) waarin het kanaal voor een werker open is */
  van: string;
  tot: string;
}

export interface Lid {
  userId: string;
  naam: string;
  rol: "werker" | "team";
  apparaat?: string;
  sinds: string;
}

export interface Signaal {
  from: string;
  to: string;
  type: "offer" | "answer" | "candidate" | "leave";
  data: unknown;
  at: string;
}

const LID = (k: string, u: string) => `ptt:${k}:lid:${u}`;
const IN = (k: string, u: string) => `ptt:${k}:in:${u}`;
const SPREKER = (k: string) => `ptt:${k}:spreker`;
const LID_TTL = 25;
const IN_TTL = 120;

/** Een werker mag erin van 2 uur vóór tot 1 uur na de dienst. */
const WERKER_VOOR_MS = 2 * 3_600_000;
const WERKER_NA_MS = 3_600_000;

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
function dagTekst(d: Date): string {
  const p = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd = WD[new Date(d).getUTCDay()] ?? "";
  void wd;
  return `${v("weekday")} ${v("day")}-${v("month")} ${v("hour")}:${v("minute")}`;
}

/* ─────────────── welke kanalen ─────────────── */

/** De kanalen van een werker: de klussen waarvoor hij nu (met marge) ingepland staat, plus hun vestiging. */
export async function kanalenVanWerker(userId: string, nu = new Date()): Promise<Kanaal[]> {
  const rows = await prisma.shiftAssignment.findMany({
    where: {
      cancelledAt: null,
      freelancer: { userId },
      shift: { status: { notIn: ["CANCELLED", "DRAFT"] }, startsAt: { lte: new Date(nu.getTime() + WERKER_VOOR_MS) }, endsAt: { gte: new Date(nu.getTime() - WERKER_NA_MS) } },
    },
    select: { shift: { select: { id: true, title: true, startsAt: true, endsAt: true, branchId: true, branch: { select: { name: true, city: true, tenantId: true, tenant: { select: { name: true } } } } } } },
    orderBy: { shift: { startsAt: "asc" } },
  });
  const out: Kanaal[] = [];
  const gezien = new Set<string>();
  for (const { shift } of rows) {
    const van = new Date(shift.startsAt.getTime() - WERKER_VOOR_MS).toISOString();
    const tot = new Date(shift.endsAt.getTime() + WERKER_NA_MS).toISOString();
    out.push({
      id: kanaalId("klus", shift.id),
      soort: "klus",
      titel: shift.title,
      ondertitel: `${shift.branch.tenant.name} · ${dagTekst(shift.startsAt)}`,
      tenantId: shift.branch.tenantId,
      branchId: shift.branchId,
      shiftId: shift.id,
      van,
      tot,
    });
    if (!gezien.has(shift.branchId)) {
      gezien.add(shift.branchId);
      out.push({
        id: kanaalId("vestiging", shift.branchId),
        soort: "vestiging",
        titel: `${shift.branch.name} (hele locatie)`,
        ondertitel: `${shift.branch.tenant.name} · iedereen die hier vandaag werkt`,
        tenantId: shift.branch.tenantId,
        branchId: shift.branchId,
        van,
        tot,
      });
    }
  }
  return out;
}

/** De kanalen van het team van een bedrijf: elke vestiging, plus de klussen van vandaag en morgen. */
export async function kanalenVanTeam(tenantId: string, branchIds: string[] | null, nu = new Date()): Promise<Kanaal[]> {
  const branches = await prisma.branch.findMany({
    where: { tenantId, kind: "PERMANENT", ...(branchIds ? { id: { in: branchIds } } : {}) },
    select: { id: true, name: true, city: true, tenant: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const shifts = await prisma.shift.findMany({
    where: {
      branch: { tenantId, ...(branchIds ? { id: { in: branchIds } } : {}) },
      status: { notIn: ["CANCELLED", "DRAFT"] },
      startsAt: { lte: new Date(nu.getTime() + 36 * 3_600_000) },
      endsAt: { gte: new Date(nu.getTime() - WERKER_NA_MS) },
    },
    select: { id: true, title: true, startsAt: true, endsAt: true, branchId: true, branch: { select: { name: true, tenant: { select: { name: true } } } } },
    orderBy: { startsAt: "asc" },
    take: 60,
  });
  const altijd = { van: new Date(0).toISOString(), tot: new Date(8.64e15).toISOString() };
  return [
    ...branches.map(
      (b): Kanaal => ({ id: kanaalId("vestiging", b.id), soort: "vestiging", titel: `${b.name} (hele locatie)`, ondertitel: `${b.city} · iedereen die hier vandaag werkt`, tenantId, branchId: b.id, ...altijd }),
    ),
    ...shifts.map(
      (s): Kanaal => ({
        id: kanaalId("klus", s.id),
        soort: "klus",
        titel: s.title,
        ondertitel: `${s.branch.name} · ${dagTekst(s.startsAt)}`,
        tenantId,
        branchId: s.branchId,
        shiftId: s.id,
        ...altijd,
      }),
    ),
  ];
}

export interface Toegang {
  kanaal: Kanaal;
  rol: Lid["rol"];
}

/** Mag deze persoon dit kanaal in? Werkers via hun dienst, het team van het bedrijf via de vestiging. */
export async function kanaalToegang(p: Principal, id: string, nu = new Date()): Promise<Toegang> {
  const gelezen = leesKanaalId(id);
  if (!gelezen) throw AppError.notFound("Kanaal niet gevonden.");
  if (hasRole(p, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN")) {
    const scope = await resolveEmployerScope(p);
    for (const tenantId of scope.tenantIds) {
      const kanalen = await kanalenVanTeam(tenantId, scope.branchIds, nu);
      const k = kanalen.find((x) => x.id === id);
      if (k) return { kanaal: k, rol: "team" };
    }
  }
  const eigen = (await kanalenVanWerker(p.userId, nu)).find((x) => x.id === id);
  if (eigen) return { kanaal: eigen, rol: "werker" };
  throw AppError.forbidden("Je zit niet in dit kanaal. Alleen wie hier nu ingepland staat (of het team van de locatie) kan meeluisteren.");
}

/* ─────────────── wie is er, en de verbindingsberichten ─────────────── */

export async function meldAanwezig(kanaal: string, lid: Omit<Lid, "sinds"> & { sinds?: string }): Promise<Lid[]> {
  const k = LID(kanaal, lid.userId);
  const bestaand = await redis.get(k);
  const sinds = bestaand ? ((JSON.parse(bestaand) as Lid).sinds ?? new Date().toISOString()) : new Date().toISOString();
  const waarde: Lid = { userId: lid.userId, naam: lid.naam, rol: lid.rol, sinds, ...(lid.apparaat ? { apparaat: lid.apparaat.slice(0, 40) } : {}) };
  await redis.set(k, JSON.stringify(waarde), "EX", LID_TTL);
  return leden(kanaal);
}

export async function meldWeg(kanaal: string, userId: string): Promise<void> {
  await redis.del(LID(kanaal, userId), IN(kanaal, userId));
  const spreker = await redis.get(SPREKER(kanaal));
  if (spreker === userId) await redis.del(SPREKER(kanaal));
}

export async function leden(kanaal: string): Promise<Lid[]> {
  const keys = await redis.keys(`ptt:${kanaal}:lid:*`);
  if (keys.length === 0) return [];
  const raws = await redis.mget(...keys);
  const out: Lid[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as Lid);
    } catch {
      /* overslaan */
    }
  }
  return out.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

export async function stuurSignaal(kanaal: string, s: Omit<Signaal, "at">): Promise<void> {
  const k = IN(kanaal, s.to);
  await redis.rpush(k, JSON.stringify({ ...s, at: new Date().toISOString() } satisfies Signaal));
  await redis.expire(k, IN_TTL);
}

/** Alle berichten voor deze persoon, in één keer, daarna leeg. */
export async function haalSignalen(kanaal: string, userId: string): Promise<Signaal[]> {
  const k = IN(kanaal, userId);
  const [items] = await Promise.all([redis.lrange(k, 0, -1), redis.del(k)]);
  const out: Signaal[] = [];
  for (const raw of items) {
    try {
      out.push(JSON.parse(raw) as Signaal);
    } catch {
      /* overslaan */
    }
  }
  return out;
}

export async function zetSpreker(kanaal: string, userId: string, praat: boolean): Promise<void> {
  if (praat) await redis.set(SPREKER(kanaal), userId, "EX", 4);
  else if ((await redis.get(SPREKER(kanaal))) === userId) await redis.del(SPREKER(kanaal));
}

export async function spreker(kanaal: string): Promise<string | null> {
  return redis.get(SPREKER(kanaal));
}

/* ─────────────── het groepsgesprek voor spraakberichten ─────────────── */

/** Het chat-gesprek van dit kanaal (voor spraakberichten als iemand niet verbonden is); de leden volgen het rooster. */
export async function kanaalGesprek(kanaal: Kanaal, ownerId: string, memberIds: string[]): Promise<ChatThread> {
  const communityId = `ptt:${kanaal.id}`;
  const bestaand = await getGroupThreadByCommunity(communityId);
  const leden = [...new Set([ownerId, ...memberIds, ...(bestaand?.participants ?? [])])];
  return ensureGroupThread(communityId, `📻 ${kanaal.titel}`, bestaand?.meta.ownerId ?? ownerId, leden);
}

/* ─────────────── mijn kanalen ─────────────── */

/**
 * De kanalen van deze persoon: als team van een bedrijf alle vestigingen en de
 * klussen van vandaag, als werker de klussen waarvoor hij nu ingepland staat.
 * Alleen bedrijven met de portofoon aan (lib/locatie/store.ts).
 */
export async function kanalenVoor(p: Principal, nu = new Date()): Promise<Kanaal[]> {
  const kanalen: Kanaal[] = [];
  if (hasRole(p, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN")) {
    const scope = await resolveEmployerScope(p);
    for (const tenantId of scope.tenantIds.slice(0, 5)) {
      if (!(await locatieStand(tenantId)).modules.portofoon?.aan) continue;
      kanalen.push(...(await kanalenVanTeam(tenantId, scope.branchIds, nu)));
    }
  }
  const perTenant = new Map<string, boolean>();
  for (const k of await kanalenVanWerker(p.userId, nu)) {
    if (kanalen.some((x) => x.id === k.id)) continue;
    let aan = perTenant.get(k.tenantId);
    if (aan === undefined) {
      aan = Boolean((await locatieStand(k.tenantId)).modules.portofoon?.aan);
      perTenant.set(k.tenantId, aan);
    }
    if (aan) kanalen.push(k);
  }
  return kanalen;
}
