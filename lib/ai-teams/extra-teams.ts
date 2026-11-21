import { prisma } from "@/lib/prisma";
import { kvListValues } from "@/lib/storage/kv";
import { shiftCategory } from "@/lib/shifts/category";
import { isTenantVerified } from "@/lib/company/verified";
import { fraudForTimesheet } from "@/lib/fraud/timesheet";
import { listConversations } from "@/lib/chat/webchat";
import type { Review } from "@/lib/reviews/store";
import type { Proposal, FeedItem } from "@/lib/ai-teams";
import { servicedeskConcepten, welkomstcoach } from "@/lib/ai-teams/medewerkers";

// ---------------------------------------------------------------------------
// Six more AI-teams. Like the original five they work from real platform data
// (no language model needed, so they run on the live site), report what they
// find, and anything that reaches a person (a push to freelancers, a mail to a
// client, approving a company) is a one-click proposal for a human.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const HOUR = 3_600_000;
const OPEN = ["OPEN", "MATCHING", "PARTIALLY_FILLED"] as const;
const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

export interface TeamTools {
  log: (team: string, text: string, kind?: FeedItem["kind"]) => Promise<void>;
  propose: (p: Omit<Proposal, "id" | "at" | "status">) => Promise<void>;
}

/** Planning: klussen about to start that aren't full, and people who didn't show up. */
export async function planning(now: Date, t: TeamTools) {
  const soon = await prisma.shift.findMany({
    where: { status: { in: [...OPEN] }, startsAt: { gt: now, lte: new Date(now.getTime() + 48 * HOUR) } },
    select: { id: true, title: true, startsAt: true, positions: true, branch: { select: { name: true, tenantId: true, tenant: { select: { name: true } } } }, _count: { select: { assignments: { where: { cancelledAt: null } } } } },
    take: 200,
  });
  let short = 0;
  for (const s of soon) {
    const filled = s._count.assignments;
    if (filled / s.positions >= 0.5) continue;
    if (!(await isTenantVerified(s.branch.tenantId))) continue; // test klus: nobody can be scheduled anyway
    short++;
    const hours = Math.max(1, Math.round((s.startsAt.getTime() - now.getTime()) / HOUR));
    await t.propose({
      team: "planning",
      title: `"${s.title}" begint over ${hours} uur — ${filled}/${s.positions} bezet`,
      detail: `${s.branch.tenant.name} (${s.branch.name}). Opnieuw uitzetten naar de volgende groep passende flexkrachten?`,
      action: { type: "rematch-shift", shiftId: s.id },
    });
  }

  // No-shows: scheduled start passed more than an hour ago, nobody checked in.
  const noShows = await prisma.timesheet.findMany({
    where: {
      status: "DRAFT",
      actualStart: null,
      scheduledStart: { lte: new Date(now.getTime() - HOUR), gte: new Date(now.getTime() - DAY) },
      gpsEvents: { none: {} },
      assignment: { cancelledAt: null },
    },
    select: { scheduledStart: true, freelancer: { select: { user: { select: { fullName: true } } } }, branch: { select: { name: true, tenant: { select: { name: true } } } }, assignment: { select: { shift: { select: { title: true } } } } },
    take: 30,
  });
  for (const n of noShows) {
    await t.log("planning", `Mogelijke no-show: ${n.freelancer.user.fullName} is niet ingecheckt bij "${n.assignment.shift.title}" (${n.branch.tenant.name}, ${n.branch.name}).`, "finding");
  }
  await t.log("planning", `${soon.length} klus(sen) binnen 48 uur bekeken: ${short} met minder dan de helft bezet, ${noShows.length} mogelijke no-show(s).`);
}

/** Onboarding: companies waiting for approval while people already reacted, and sign-ups that got stuck. */
export async function onboarding(now: Date, t: TeamTools) {
  const tenants = await prisma.tenant.findMany({
    where: { type: { not: "PLATFORM" }, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } },
    select: { id: true, name: true, kvkNumber: true, branches: { select: { shifts: { where: { status: { not: "CANCELLED" } }, select: { _count: { select: { matches: { where: { status: "VIEWED" } } } } } } } } },
    take: 300,
  });
  let waiting = 0;
  for (const tn of tenants) {
    if (await isTenantVerified(tn.id)) continue;
    const reactions = tn.branches.flatMap((b) => b.shifts).reduce((n, s) => n + s._count.matches, 0);
    if (reactions === 0) continue;
    waiting++;
    await t.propose({
      team: "onboarding",
      title: `${tn.name} wacht op goedkeuring — ${reactions} freelancer(s) reageerden al`,
      detail: `${tn.kvkNumber ? `KVK ${tn.kvkNumber} kon niet automatisch worden bevestigd.` : "Nog geen KVK-nummer ingevuld."} Controleer het bedrijf (Admin → Bedrijven) en keur goed; wie reageerde krijgt dan meteen een melding.`,
      action: { type: "approve-company", tenantId: tn.id },
    });
  }

  const since = new Date(now.getTime() - 14 * DAY);
  const [unconfirmed, unverifiedWorkers] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: since, lte: new Date(now.getTime() - DAY) }, emailVerifiedAt: null, disabledAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: since, lte: new Date(now.getTime() - 2 * DAY) }, emailVerifiedAt: { not: null }, kycStatus: { not: "VERIFIED" }, memberships: { some: { role: "FREELANCER" } } } }),
  ]);
  if (unconfirmed > 0) await t.log("onboarding", `${unconfirmed} aanmelding(en) van de afgelopen 2 weken hebben hun e-mail nooit bevestigd (ze krijgen automatisch herinneringen).`, "finding");
  if (unverifiedWorkers > 0) await t.log("onboarding", `${unverifiedWorkers} freelancer(s) bevestigden hun e-mail maar zijn na 2 dagen nog niet geverifieerd — mogelijk lopen ze vast bij de ID-stap.`, "finding");
  await t.log("onboarding", `Aanmeldingen gecontroleerd: ${waiting} bedrijf/bedrijven wacht(en) op goedkeuring met reacties.`);
  // de Welkomstcoach (lib/ai-teams/medewerkers.ts): nieuwe bedrijven zonder eerste klus; een fout daarin stopt dit team niet
  await welkomstcoach(now, t).catch((e: unknown) => t.log("onboarding", `Welkomstcoach: kon niet kijken (${(e as Error)?.message ?? "onbekend"}).`, "error"));
}

/** Pricing: open klussen that pay clearly below the going rate for that kind of work. */
export async function prijs(now: Date, t: TeamTools) {
  const history = await prisma.shift.findMany({
    where: { startsAt: { gte: new Date(now.getTime() - 90 * DAY) } },
    select: { title: true, hourlyRateCents: true },
    take: 20_000,
  });
  const byCat = new Map<string, number[]>();
  for (const h of history) {
    const k = shiftCategory(h.title, null).key;
    byCat.set(k, [...(byCat.get(k) ?? []), h.hourlyRateCents]);
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  const open = await prisma.shift.findMany({
    where: { status: { in: [...OPEN] }, startsAt: { gt: now } },
    select: { id: true, title: true, hourlyRateCents: true, branch: { select: { tenantId: true, tenant: { select: { name: true } } } }, _count: { select: { assignments: { where: { cancelledAt: null } } } }, positions: true },
    take: 300,
  });
  let low = 0;
  for (const s of open) {
    const cat = shiftCategory(s.title, null);
    const rates = byCat.get(cat.key) ?? [];
    if (rates.length < 8 || s._count.assignments >= s.positions) continue;
    const m = median(rates);
    if (s.hourlyRateCents >= m * 0.85) continue;
    low++;
    const suggested = Math.round(m / 25) * 25;
    await t.propose({
      team: "prijs",
      title: `"${s.title}" betaalt ${euro(s.hourlyRateCents)}/u — markt ${euro(m)}/u`,
      detail: `${s.branch.tenant.name}. ${cat.label}-klussen betalen meestal rond ${euro(m)} per uur; deze ligt ${Math.round((1 - s.hourlyRateCents / m) * 100)}% lager en wordt daardoor trager gevuld. Tariefadvies mailen?`,
      action: { type: "rate-advice", shiftId: s.id, tenantId: s.branch.tenantId, suggestedCents: suggested },
    });
  }
  await t.log("prijs", `${open.length} open klus(sen) vergeleken met de markt van de afgelopen 90 dagen: ${low} duidelijk onder het marktgemiddelde.`);
}

/** Quality: who gets poor reviews, and which freelancers cancel a lot. */
export async function kwaliteit(now: Date, t: TeamTools) {
  const lists = await kvListValues<Review[]>("reviews:", 2000);
  let flagged = 0;
  for (const reviews of lists) {
    if (!Array.isArray(reviews) || reviews.length < 3) continue;
    const recent = reviews.filter((r) => new Date(r.at).getTime() >= now.getTime() - 180 * DAY);
    if (recent.length < 3) continue;
    const avg = recent.reduce((s, r) => s + r.rating, 0) / recent.length;
    if (avg >= 3) continue;
    flagged++;
    const r0 = recent[0]!;
    const who = r0.subjectType === "freelancer" ? `Freelancer ${r0.subjectId.slice(0, 8)}` : `Bedrijf ${r0.subjectId.slice(0, 8)}`;
    await t.log("kwaliteit", `${who}: gemiddeld ${avg.toFixed(1)} sterren over ${recent.length} beoordelingen (6 mnd). Laatste: "${r0.text.slice(0, 120)}"`, "finding");
  }
  const cancels = await prisma.shiftAssignment.groupBy({
    by: ["freelancerId"],
    where: { cancelledAt: { gte: new Date(now.getTime() - 30 * DAY) } },
    _count: { _all: true },
    having: { freelancerId: { _count: { gte: 3 } } },
  });
  for (const c of cancels.slice(0, 15)) {
    const fp = await prisma.freelancerProfile.findUnique({ where: { id: c.freelancerId }, select: { user: { select: { fullName: true } } } });
    await t.log("kwaliteit", `${fp?.user.fullName ?? c.freelancerId} zegde ${c._count._all} klussen af in 30 dagen.`, "finding");
  }
  await t.log("kwaliteit", `Beoordelingen en afzeggingen gecontroleerd: ${flagged} met een lage score, ${cancels.length} met veel afzeggingen.`);
}

/** Customer service: website-chat questions nobody answered. */
export async function klantenservice(now: Date, t: TeamTools) {
  const open = [...(await listConversations("open", 300)), ...(await listConversations("human", 300))];
  const waiting = open.filter((c) => {
    const last = c.messages.at(-1);
    return last?.role === "user" && now.getTime() - new Date(last.at).getTime() > 4 * HOUR;
  });
  for (const c of waiting.slice(0, 15)) {
    const q = [...c.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const h = Math.round((now.getTime() - new Date(c.lastAt).getTime()) / HOUR);
    await t.log("klantenservice", `Websitechat wacht al ${h} uur op antwoord: "${q.slice(0, 140)}" — Admin → Webchat.`, "finding");
  }
  await t.log("klantenservice", `${open.length} open websitechat(s) bekeken, ${waiting.length} wachten langer dan 4 uur op een antwoord.`);
  // de Servicedesk (lib/ai-teams/medewerkers.ts): een conceptantwoord voor wie te lang wacht, pas na goedkeuring in de chat
  if (waiting.length > 0) {
    await servicedeskConcepten(now, t).catch((e: unknown) => t.log("klantenservice", `Servicedesk: kon geen concepten maken (${(e as Error)?.message ?? "onbekend"}).`, "error"));
  }
}

/** Veiligheid: verdachte uren. (De controle op tweestapsverificatie van beheerders is weg: die bestaat niet meer, 21 nov 2026.) */
export async function veiligheid(now: Date, t: TeamTools) {
  const recent = await prisma.timesheet.findMany({
    where: { status: "SUBMITTED", submittedAt: { gte: new Date(now.getTime() - 7 * DAY) } },
    select: { id: true, freelancer: { select: { user: { select: { fullName: true } } } } },
    take: 40,
  });
  let suspicious = 0;
  for (const ts of recent) {
    const flags = (await fraudForTimesheet(ts.id).catch(() => [])).filter((f) => f.severity === "critical");
    if (!flags.length) continue;
    suspicious++;
    await t.log("veiligheid", `Verdachte uren van ${ts.freelancer.user.fullName}: ${flags.map((f) => f.message).join("; ")}`, "finding");
  }
  await t.log("veiligheid", `${recent.length} ingediende urenbriefje(s) gecontroleerd: ${suspicious} met ernstige fraudesignalen.`);
}
