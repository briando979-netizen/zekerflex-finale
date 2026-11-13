import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { UserPrefs } from "@/lib/prefs/store";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { pushDay, pushRate } from "@/lib/i18n/worker-push";
import { prefsAllowShift } from "@/lib/matching/worker-prefs";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { isBlockedByAny } from "@/lib/employer/relations";
import { klusKenmerk, testklusMeldfilter } from "@/lib/shifts/testklus-db";

// ---------------------------------------------------------------------------
// Standby-modus (/dashboard/beschikbaarheid: "ik spring bij voor spoeddiensten").
// Werd opgeslagen maar nergens gebruikt. Een spoeddienst = een openbare dienst
// die binnen 24 uur begint en nog open plekken heeft (net geplaatst, of iemand
// zegde af). Werkers op standby krijgen dan meteen een push, binnen hun eigen
// beschikbaarheid en minimumtarief, niet bij een opdrachtgever die hen
// blokkeerde, niet als ze op dat moment al werken; uitzenddiensten alleen voor
// uitzendkrachten.
// ---------------------------------------------------------------------------

export const URGENT_WITHIN_MS = 24 * 3_600_000;

export function isUrgent(startsAt: Date, now = new Date()): boolean {
  const ms = startsAt.getTime() - now.getTime();
  return ms > 0 && ms <= URGENT_WITHIN_MS;
}

export async function notifyStandby(shiftId: string, now = new Date()): Promise<{ notified: number }> {
  const s = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      startsAt: true,
      endsAt: true,
      hourlyRateCents: true,
      positions: true,
      status: true,
      visibility: true,
      viaUitzendbureau: true,
      branch: { select: { city: true, tenantId: true, tenant: { select: { name: true } } } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
  });
  if (!s || s.visibility !== "PUBLIC" || !["OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(s.status)) return { notified: 0 };
  if (!isUrgent(s.startsAt, now) || s._count.assignments >= s.positions) return { notified: 0 };

  const rows = await prisma.$queryRaw<{ key: string; value: Partial<UserPrefs> }[]>`
    SELECT key, value FROM "KeyValueStore"
    WHERE key LIKE 'prefs:%' AND value->>'standby' = 'true'
    LIMIT 2000`;

  // een testklus alleen naar interne accounts (lib/shifts/testklus-db.ts)
  const testklus = await testklusMeldfilter();
  const recipients: string[] = [];
  for (const row of rows) {
    const userId = row.key.slice("prefs:".length);
    if (!(await testklus.mag(klusKenmerk(s), userId))) continue;
    if (!prefsAllowShift(row.value, s)) continue;
    if (s.viaUitzendbureau && invoiceModeFor(await getFiscal(userId)) !== "payroll") continue;
    if (await isBlockedByAny([s.branch.tenantId], userId)) continue;
    const busy = await prisma.shiftAssignment.count({
      where: { cancelledAt: null, freelancer: { userId }, shift: { startsAt: { lt: s.endsAt }, endsAt: { gt: s.startsAt } } },
    });
    if (busy > 0) continue;
    recipients.push(userId);
  }
  if (!recipients.length) return { notified: 0 };

  await sendLocalizedPush(recipients, (t, locale) => ({
    title: t.standbyTitle(s.title),
    body: t.standbyBody(`${pushDay(locale, s.startsAt)} · ${s.branch.city} · ${pushRate(t, s.hourlyRateCents)}`).slice(0, 180),
    data: { type: "SHIFT_OFFER", url: `/dashboard/klussen/${s.id}`, tag: `spoed-${s.id}` },
    ttlSeconds: 6 * 3600,
  })).catch((err) => logger.warn("standby push failed", { shiftId, error: (err as Error).message }));
  return { notified: recipients.length };
}
