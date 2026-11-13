import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { JobAlert, UserPrefs } from "@/lib/prefs/store";
import { shiftCategory } from "@/lib/shifts/category";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { pushDay, pushRate } from "@/lib/i18n/worker-push";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { prefsAllowShift } from "@/lib/matching/worker-prefs";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { isBlockedByAny } from "@/lib/employer/relations";
import { klusKenmerk, testklusMeldfilter } from "@/lib/shifts/testklus-db";
import { eenmaligPush } from "@/lib/notifications/push-eenmalig";

// ---------------------------------------------------------------------------
// Job-alerts (/dashboard/beschikbaarheid): "Zodra er een passende dienst is,
// verschijnt die bovenaan je klussenoverzicht met een melding." Ze werden wel
// opgeslagen maar nergens gebruikt. Een alert is vrije tekst ("Horeca
// Amsterdam avond") met eventueel een minimumtarief: elk woord moet terugkomen
// in de klus (titel, functie, categorie, stad, dagdeel of weekdag).
// ---------------------------------------------------------------------------

const WEEKDAY_NL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const STOP = new Set(["een", "het", "and", "voor", "bij", "met", "van", "the"]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** De zoekwoorden van een alert: kleine letters, zonder accenten, minstens 3 tekens. */
export function alertTokens(label: string): string[] {
  return norm(label)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

export interface AlertShift {
  title: string;
  skill: string | null;
  city: string;
  startsAt: Date;
  hourlyRateCents: number;
}

export function alertMatches(alert: Pick<JobAlert, "label" | "minRateCents">, shift: AlertShift): boolean {
  if (alert.minRateCents && shift.hourlyRateCents < alert.minRateCents) return false;
  const tokens = alertTokens(alert.label);
  if (tokens.length === 0) return false; // a label without words matches nothing (no push spam)
  const p = amsterdamParts(shift.startsAt);
  const cat = shiftCategory(shift.title, shift.skill);
  const daypart = p.hour < 12 ? "ochtend" : p.hour < 17 ? "middag" : "avond";
  const hay = norm(
    [shift.title, shift.skill ?? "", shift.city, cat.key, cat.label, daypart, WEEKDAY_NL[p.weekday] ?? "", p.weekday === 0 || p.weekday === 6 ? "weekend" : ""].join(" "),
  );
  return tokens.every((t) => hay.includes(t));
}

/** The label of the first alert this shift matches, or null. */
export function matchingAlert(alerts: readonly JobAlert[] | undefined, shift: AlertShift): string | null {
  return (alerts ?? []).find((a) => alertMatches(a, shift))?.label ?? null;
}

/**
 * Push to workers whose alert matches one of these newly published shifts.
 * One message per worker (the first matching shift), only for public shifts in
 * the future, and only within the worker's own availability / minimum rate.
 */
export async function notifyJobAlerts(shiftIds: string[], now = new Date()): Promise<{ notified: number }> {
  if (!shiftIds.length) return { notified: 0 };
  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds }, visibility: "PUBLIC", status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, createdAt: true, startsAt: true, hourlyRateCents: true, viaUitzendbureau: true, requiredSkill: { select: { name: true } }, branch: { select: { city: true, tenantId: true, tenant: { select: { name: true } } } } },
  });
  if (!shifts.length) return { notified: 0 };
  // een testklus alleen naar interne accounts (lib/shifts/testklus-db.ts)
  const testklus = await testklusMeldfilter();

  // Only the prefs rows that actually hold an alert, filtered in Postgres.
  const rows = await prisma.$queryRaw<{ key: string; value: Partial<UserPrefs> }[]>`
    SELECT key, value FROM "KeyValueStore"
    WHERE key LIKE 'prefs:%' AND jsonb_typeof(value->'jobAlerts') = 'array' AND jsonb_array_length(value->'jobAlerts') > 0
    LIMIT 5000`;

  let notified = 0;
  for (const row of rows) {
    const userId = row.key.slice("prefs:".length);
    const mogelijk: typeof shifts = [];
    for (const s of shifts) if (await testklus.mag(klusKenmerk(s), userId)) mogelijk.push(s);
    const matches = mogelijk
      .filter((s) => prefsAllowShift(row.value, s))
      .map((s) => ({ s, label: matchingAlert(row.value.jobAlerts, { ...s, skill: s.requiredSkill?.name ?? null, city: s.branch.city }) }))
      .filter((x) => x.label);
    if (!matches.length) continue;
    // A shift via the uitzendbureau is only for uitzendkrachten (payroll track), as in the follower push;
    // and never a shift of a client that blocked this worker (the marketplace hides those too).
    const payroll = matches.some((x) => x.s.viaUitzendbureau) && invoiceModeFor(await getFiscal(userId)) === "payroll";
    let hit: (typeof matches)[number] | null = null;
    for (const x of matches) {
      if (x.s.viaUitzendbureau && !payroll) continue;
      if (await isBlockedByAny([x.s.branch.tenantId], userId)) continue;
      // één keer per klus: opnieuw openbaar zetten stuurt hem niet nog eens (lib/notifications/push-eenmalig.ts)
      if (!(await eenmaligPush("alert", x.s.id, userId, now))) continue;
      hit = x;
      break;
    }
    if (!hit) continue;
    // altijd in de app-taal van de werker (sendLocalizedPush groepeert per taal, WORKER_PUSH); de titel is de eigen zoekopdracht van de werker
    const gevonden = hit;
    await sendLocalizedPush([userId], (t, locale) => ({
      title: `🔔 ${gevonden.label}`,
      body: `${gevonden.s.title} · ${pushDay(locale, gevonden.s.startsAt)} · ${gevonden.s.branch.city} · ${pushRate(t, gevonden.s.hourlyRateCents)}`.slice(0, 180),
      data: { type: "SHIFT_OFFER", url: `/dashboard/klussen/${gevonden.s.id}`, tag: `alert-${gevonden.s.id}` },
      ttlSeconds: 12 * 3600,
    })).catch((err) => logger.warn("job alert push failed", { error: (err as Error).message }));
    notified += 1;
  }
  return { notified };
}
