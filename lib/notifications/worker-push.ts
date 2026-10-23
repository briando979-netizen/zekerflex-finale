import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendUserPush } from "@/lib/notifications/push";
import { notifyNearbyOpenShifts } from "@/lib/notifications/geo-push";

// ---------------------------------------------------------------------------
// Push notifications for werknemers (app + web). Each one is sent at most
// once per assignment/user (KV "push-sent:<kind>:<id>", claimed BEFORE
// sending so two overlapping sweeps can't double-send):
//   selected  — "Je bent uitgekozen" right after an assignment is made
//   day       — the day before (≈24h) "bereid je goed voor"
//   soon      — ≈2 hours before
//   start     — at the start "check in"
//   profile   — "vul je gegevens in om te beginnen" (max 3×, ≥3 days apart)
// sweepWorkerPushes() runs from the frequent notifications poll (throttled to
// once per 4 minutes through KV) and from the daily cron, so it works without
// a high-frequency scheduler.
// ---------------------------------------------------------------------------

const TZ = "Europe/Amsterdam";
const dayFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const H = 3_600_000;

async function claim(kind: string, id: string, ttlNote = ""): Promise<boolean> {
  const key = `push-sent:${kind}:${id}`;
  if (await kvGet(key)) return false;
  await kvSet(key, { at: new Date().toISOString(), note: ttlNote });
  return true;
}

function shiftUrl(shiftId: string): string {
  return `/dashboard/klussen/${shiftId}`;
}

interface Row {
  id: string;
  acceptedAt: Date;
  freelancer: { userId: string };
  shift: { id: string; title: string; startsAt: Date; branch: { name: string } };
}

async function send(userId: string, title: string, body: string, shiftId: string, tag: string, ttlSeconds: number): Promise<void> {
  await sendUserPush([userId], { title, body, data: { type: "SHIFT", url: shiftUrl(shiftId), tag }, ttlSeconds });
}

/** "Je bent uitgekozen" for assignments made in the last 6 hours. */
async function selectedPushes(now: Date): Promise<number> {
  const rows: Row[] = await prisma.shiftAssignment.findMany({
    where: { cancelledAt: null, acceptedAt: { gte: new Date(now.getTime() - 6 * H) }, shift: { startsAt: { gt: now } } },
    select: { id: true, acceptedAt: true, freelancer: { select: { userId: true } }, shift: { select: { id: true, title: true, startsAt: true, branch: { select: { name: true } } } } },
    take: 500,
  });
  let n = 0;
  for (const a of rows) {
    if (!(await claim("selected", a.id))) continue;
    const when = `${dayFmt.format(a.shift.startsAt)} om ${timeFmt.format(a.shift.startsAt)}`;
    await send(a.freelancer.userId, "🎉 Je bent uitgekozen!", `${a.shift.title} bij ${a.shift.branch.name}, ${when}. Bekijk de klus in de app.`, a.shift.id, `selected-${a.id}`, 24 * 3600);
    n += 1;
  }
  return n;
}

const REMINDERS = [
  { kind: "day", before: 24 * H, window: 10 * H, title: () => "📅 Morgen werken", body: (r: Row) => `${r.shift.title} bij ${r.shift.branch.name} begint morgen om ${timeFmt.format(r.shift.startsAt)}. Bereid je goed voor: check de route en je werkkleding.` },
  { kind: "soon", before: 2 * H, window: 90 * 60_000, title: () => "⏰ Over 2 uur begint je klus", body: (r: Row) => `${r.shift.title} bij ${r.shift.branch.name} om ${timeFmt.format(r.shift.startsAt)}. Vertrek op tijd!` },
  { kind: "start", before: 0, window: 30 * 60_000, title: () => "▶️ Je klus begint nu", body: (r: Row) => `${r.shift.title} bij ${r.shift.branch.name}. Vergeet niet in te checken in de app.` },
] as const;

/** Reminders before/at the start of upcoming klussen. */
async function reminderPushes(now: Date): Promise<number> {
  const rows: Row[] = await prisma.shiftAssignment.findMany({
    where: {
      cancelledAt: null,
      shift: { status: { notIn: ["CANCELLED", "COMPLETED", "DRAFT"] }, startsAt: { gt: new Date(now.getTime() - 30 * 60_000), lt: new Date(now.getTime() + 25 * H) } },
    },
    select: { id: true, acceptedAt: true, freelancer: { select: { userId: true } }, shift: { select: { id: true, title: true, startsAt: true, branch: { select: { name: true } } } } },
    take: 2000,
  });
  let n = 0;
  for (const r of rows) {
    const msUntil = r.shift.startsAt.getTime() - now.getTime();
    // newest-applicable reminder only (no "morgen" an hour before the start)
    const due = REMINDERS.find((x) => msUntil <= x.before && msUntil > x.before - x.window);
    if (!due) continue;
    // skip "day" when the assignment was made less than 12h ago — they just got "uitgekozen"
    if (due.kind === "day" && now.getTime() - r.acceptedAt.getTime() < 12 * H) continue;
    if (!(await claim(due.kind, r.id))) continue;
    await send(r.freelancer.userId, due.title(), due.body(r), r.shift.id, `${due.kind}-${r.id}`, Math.max(600, Math.round(due.window / 1000)));
    n += 1;
  }
  return n;
}

/** "Vul je gegevens in om te beginnen" — freelancers that aren't verified yet. */
async function profilePushes(now: Date): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      disabledAt: null,
      kycStatus: { not: "VERIFIED" },
      createdAt: { lt: new Date(now.getTime() - 24 * H) },
      memberships: { some: { role: "FREELANCER" } },
      webPushSubscriptions: { some: { disabledAt: null } },
    },
    select: { id: true },
    take: 500,
  });
  let n = 0;
  for (const u of users) {
    const key = `push-profile:${u.id}`;
    const st = (await kvGet<{ count: number; last: string }>(key)) ?? { count: 0, last: "1970-01-01T00:00:00Z" };
    if (st.count >= 3 || now.getTime() - new Date(st.last).getTime() < 3 * 24 * H) continue;
    await kvSet(key, { count: st.count + 1, last: now.toISOString() });
    await sendUserPush([u.id], {
      title: "Je bent er bijna 👋",
      body: "Vul je gegevens in om te beginnen — daarna kun je direct op klussen reageren.",
      data: { type: "PROFILE", url: "/dashboard/verificatie", tag: "profile-nudge" },
      ttlSeconds: 24 * 3600,
    });
    n += 1;
  }
  return n;
}

export async function sweepWorkerPushes(now = new Date()): Promise<{ selected: number; reminders: number; profile: number; geo: number }> {
  const [selected, reminders] = [await selectedPushes(now), await reminderPushes(now)];
  // the profile nudge only in daytime (09–20h Amsterdam)
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: TZ }).format(now));
  const profile = hour >= 9 && hour < 20 ? await profilePushes(now) : 0;
  // geo-targeted push for soon-starting, still-open shifts (daytime only)
  const geo = hour >= 8 && hour < 21 ? await notifyNearbyOpenShifts(now).catch(() => 0) : 0;
  return { selected, reminders, profile, geo };
}

/** Called from frequently-hit endpoints: runs the sweep at most once per 4 minutes. */
export async function maybeSweepWorkerPushes(): Promise<void> {
  const key = "push-sweep:last";
  const last = await kvGet<string>(key).catch(() => null);
  if (last && Date.now() - new Date(last).getTime() < 4 * 60_000) return;
  await kvSet(key, new Date().toISOString());
  try {
    const r = await sweepWorkerPushes();
    if (r.selected + r.reminders + r.profile + r.geo > 0) logger.info("worker pushes sent", r);
  } catch (err) {
    logger.warn("worker push sweep failed", { error: (err as Error).message });
  }
}

/** Direct push when a reaction is declined (the accept case is covered by selectedPushes). */
export async function pushOfferDeclined(userId: string, shift: { id: string; title: string }): Promise<void> {
  await sendUserPush([userId], {
    title: "Reactie niet gekozen",
    body: `Voor "${shift.title}" is iemand anders gekozen. Er staan nog genoeg andere klussen voor je klaar.`,
    data: { type: "SHIFT", url: "/dashboard/klussen", tag: `declined-${shift.id}` },
    ttlSeconds: 24 * 3600,
  }).catch(() => 0);
}
