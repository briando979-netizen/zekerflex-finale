import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendUserPush } from "@/lib/notifications/push";
import { haversineMeters } from "@/lib/geo/geofencing";
import { isMatchEligibleWorker } from "@/lib/matching/engine";
import { blockedUserIdsForTenants } from "@/lib/employer/relations";

// ---------------------------------------------------------------------------
// Geo-targeted push: een dienst die bijna begint maar nog plekken open heeft →
// directe melding aan beschikbare werknemers in de buurt ("Dienst dichtbij,
// begint over 2 uur"). Converteert ad-hoc klussen direct naar reacties.
//
// Alleen werknemers die er geschikt voor zijn (fiscaal/vakmatch), niet door de
// opdrachtgever geblokkeerd, binnen de straal van de vestiging, en die push aan
// hebben staan. Eén melding per (dienst, werknemer) via de dedup-claim. Rijdt
// mee op de bestaande frequente push-sweep, dus geen extra scheduler nodig.
// ---------------------------------------------------------------------------

const H = 3_600_000;
const DEFAULT_RADIUS_KM = 15;
const MAX_RECIPIENTS = 40;
const WINDOW_MIN_H = 1; // niet eerder dan 1u van tevoren
const WINDOW_MAX_H = 8; // en niet later dan 8u van tevoren

const timeFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

async function claimGeo(shiftId: string, userId: string): Promise<boolean> {
  const key = `push-sent:geo:${shiftId}:${userId}`;
  if (await kvGet(key)) return false;
  await kvSet(key, { at: new Date().toISOString() });
  return true;
}

export async function notifyNearbyOpenShifts(now = new Date(), radiusKm = DEFAULT_RADIUS_KM): Promise<number> {
  const shifts = await prisma.shift.findMany({
    where: {
      status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
      visibility: "PUBLIC",
      startsAt: { gt: new Date(now.getTime() + WINDOW_MIN_H * H), lte: new Date(now.getTime() + WINDOW_MAX_H * H) },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      positions: true,
      hourlyRateCents: true,
      viaUitzendbureau: true,
      requiredSkillId: true,
      branch: { select: { name: true, city: true, latitude: true, longitude: true, tenantId: true } },
      assignments: { where: { cancelledAt: null }, select: { id: true } },
    },
    orderBy: { startsAt: "asc" },
    take: 40,
  });

  let sent = 0;
  for (const shift of shifts) {
    if (shift.assignments.length >= shift.positions) continue;
    const { latitude: blat, longitude: blng } = shift.branch;
    if (!Number.isFinite(blat) || !Number.isFinite(blng)) continue;

    // workers this tenant has blocked (one lookup, not per candidate)
    const blocked = await blockedUserIdsForTenants([shift.branch.tenantId]).catch(() => new Set<string>());

    // candidate workers with a home location, roughly near the branch (±0.3° ≈ 33km prefilter)
    const candidates = await prisma.freelancerProfile.findMany({
      where: {
        user: { disabledAt: null },
        homeLatitude: { gte: blat - 0.3, lte: blat + 0.3 },
        homeLongitude: { gte: blng - 0.45, lte: blng + 0.45 },
        ...(shift.requiredSkillId ? { skills: { some: { skillId: shift.requiredSkillId } } } : {}),
      },
      select: { userId: true, vatValid: true, kvkValid: true, homeLatitude: true, homeLongitude: true },
      take: 500,
    });

    const near = candidates
      .filter((c) => !blocked.has(c.userId))
      .map((c) => ({ c, km: haversineMeters({ latitude: blat, longitude: blng }, { latitude: c.homeLatitude, longitude: c.homeLongitude }) / 1000 }))
      .filter((x) => x.km <= radiusKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_RECIPIENTS);

    const hoursOut = Math.round((shift.startsAt.getTime() - now.getTime()) / H);
    for (const { c, km } of near) {
      if (!(await isMatchEligibleWorker(c, shift.viaUitzendbureau))) continue;
      if (!(await claimGeo(shift.id, c.userId))) continue;
      await sendUserPush([c.userId], {
        title: `📍 Klus dichtbij — begint over ${hoursOut} uur`,
        body: `${shift.title} in ${shift.branch.city} (±${km.toFixed(0)} km), start ${timeFmt.format(shift.startsAt)} · €${(shift.hourlyRateCents / 100).toFixed(2).replace(".", ",")}/uur. Reageer snel in de app.`,
        data: { type: "SHIFT", url: `/dashboard/klussen/${shift.id}`, tag: `geo-${shift.id}` },
        ttlSeconds: Math.max(600, hoursOut * H / 1000),
      }).catch(() => 0);
      sent += 1;
    }
  }
  return sent;
}
