import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { sendUserPush } from "@/lib/notifications/push";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Favoriete opdrachtgevers: een werker volgt een bedrijf (❤️ op de dienstpagina)
// en krijgt een push zodra dat bedrijf een openbare dienst plaatst of
// publiceert. Twee KV-lijsten, zodat beide kanten snel zijn:
//   "volgt:<userId>"    → tenantIds die deze werker volgt
//   "volgers:<tenantId>" → userIds die dit bedrijf volgen (voor de melding)
// Een melding gaat alleen uit als de eigen lijst van de werker het bedrijf nog
// bevat; "volgt:" staat op de AVG-wislijst, dus na accountverwijdering stopt het.
// ---------------------------------------------------------------------------

const MAX_FOLLOWS = 50;
const MAX_FOLLOWERS = 5000;
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const followsKey = (userId: string) => `volgt:${userId}`;
const followersKey = (tenantId: string) => `volgers:${tenantId}`;

async function getList(key: string): Promise<string[]> {
  return (await kvGet<string[]>(key)) ?? [];
}

export async function isFollowing(userId: string, tenantId: string): Promise<boolean> {
  return (await getList(followsKey(userId))).includes(tenantId);
}

export async function setFollow(userId: string, tenantId: string, follow: boolean): Promise<{ following: boolean }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw AppError.notFound("Deze opdrachtgever bestaat niet");

  const mine = await getList(followsKey(userId));
  const followers = await getList(followersKey(tenantId));
  if (follow) {
    if (!mine.includes(tenantId)) {
      if (mine.length >= MAX_FOLLOWS) throw AppError.validation(`Je kunt maximaal ${MAX_FOLLOWS} opdrachtgevers volgen`);
      await kvSet(followsKey(userId), [...mine, tenantId]);
    }
    if (!followers.includes(userId)) await kvSet(followersKey(tenantId), [...followers, userId].slice(-MAX_FOLLOWERS));
  } else {
    if (mine.includes(tenantId)) await kvSet(followsKey(userId), mine.filter((t) => t !== tenantId));
    if (followers.includes(userId)) await kvSet(followersKey(tenantId), followers.filter((u) => u !== userId));
  }
  return { following: follow };
}

export interface FollowedEmployer {
  tenantId: string;
  name: string;
  openShifts: number;
}

/** De opdrachtgevers die je volgt, met hoeveel open diensten ze nu hebben. */
export async function listFollows(userId: string, now = new Date()): Promise<FollowedEmployer[]> {
  const ids = await getList(followsKey(userId));
  if (!ids.length) return [];
  const [tenants, open] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.shift.findMany({
      where: { branch: { tenantId: { in: ids } }, visibility: "PUBLIC", status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { gte: now } },
      select: { branch: { select: { tenantId: true } } },
      take: 2000,
    }),
  ]);
  const counts = new Map<string, number>();
  for (const s of open) counts.set(s.branch.tenantId, (counts.get(s.branch.tenantId) ?? 0) + 1);
  const name = new Map(tenants.map((t) => [t.id, t.name]));
  // In de volgorde waarin je ze volgde, nieuwste eerst; verdwenen bedrijven vallen weg.
  return [...ids]
    .reverse()
    .filter((id) => name.has(id))
    .map((id) => ({ tenantId: id, name: name.get(id)!, openShifts: counts.get(id) ?? 0 }));
}

/** Hoeveel werkers volgen (een van) deze bedrijven — voor het werkgeversdashboard. Telt alleen echte volgers. */
export async function followerCount(tenantIds: string[]): Promise<number> {
  const unique = new Set<string>();
  for (const tenantId of tenantIds) {
    for (const userId of (await getList(followersKey(tenantId))).slice(-500)) {
      if (!unique.has(userId) && (await isFollowing(userId, tenantId))) unique.add(userId);
    }
  }
  return unique.size;
}

function whenLabel(d: Date): string {
  const p = amsterdamParts(d);
  return `${p.day} ${MONTHS[p.month - 1]} ${amsterdamClock(d)}`;
}

/**
 * Push naar de volgers van het bedrijf achter deze (net geplaatste of
 * gepubliceerde) diensten. Eén push per werker per bedrijf, ook als het een
 * reeks van meerdere dagen is. Alleen openbare, open diensten in de toekomst;
 * een dienst alleen via het uitzendbureau gaat alleen naar uitzendkrachten.
 */
export async function notifyFollowersOfShifts(shiftIds: string[], now = new Date()): Promise<{ notified: number }> {
  if (!shiftIds.length) return { notified: 0 };
  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds }, visibility: "PUBLIC", status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, hourlyRateCents: true, viaUitzendbureau: true, branch: { select: { tenantId: true, city: true, tenant: { select: { name: true } } } } },
  });
  const byTenant = new Map<string, typeof shifts>();
  for (const s of shifts) byTenant.set(s.branch.tenantId, [...(byTenant.get(s.branch.tenantId) ?? []), s]);

  let notified = 0;
  for (const [tenantId, list] of byTenant) {
    const first = list[0]!;
    const onlyUitzend = list.every((s) => s.viaUitzendbureau);
    const recipients: string[] = [];
    for (const userId of await getList(followersKey(tenantId))) {
      // De eigen lijst is leidend: ontvolgd of account verwijderd → geen push.
      if (!(await isFollowing(userId, tenantId))) continue;
      if (onlyUitzend && invoiceModeFor(await getFiscal(userId)) !== "payroll") continue;
      recipients.push(userId);
    }
    if (!recipients.length) continue;

    const rate = `€ ${(first.hourlyRateCents / 100).toFixed(2).replace(".", ",")}/u`;
    const more = list.length > 1 ? ` (+${list.length - 1} ${list.length === 2 ? "dag" : "dagen"})` : "";
    await sendUserPush(recipients, {
      title: `❤️ Nieuwe dienst bij ${first.branch.tenant.name}`,
      body: `${first.title} · ${whenLabel(first.startsAt)}${more} · ${first.branch.city} · ${rate}`.slice(0, 180),
      data: { type: "SHIFT_OFFER", url: `/dashboard/klussen/${first.id}`, tag: `volg-${first.id}` },
      ttlSeconds: 12 * 3600,
    }).catch((err) => logger.warn("follower push failed", { tenantId, error: (err as Error).message }));
    notified += recipients.length;
  }
  return { notified };
}
