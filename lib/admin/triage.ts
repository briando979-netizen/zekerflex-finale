import { prisma } from "@/lib/prisma";
import { listReplacementRequests } from "@/lib/replacements/store";
import { claimsInIncasso } from "@/lib/claims/store";
import { doubleBookedPairs } from "@/lib/shifts/worker-overlap";
import { zonderTestklussen } from "@/lib/shifts/testklus-db";

// Unified "needs a human" queue, built from read-only queries + the filesystem
// replacement requests. No writes anywhere.

export interface TriageItem {
  id: string;
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  href: string;
  at: string;
}

const DAY = 24 * 3600 * 1000;

export async function getTriage(): Promise<TriageItem[]> {
  const now = Date.now();
  const items: TriageItem[] = [];
  // geen testklussen als werk-om-te-doen: de vestigingsnaam van een testbedrijf zegt vaak niet "test"
  const zonderTest = await zonderTestklussen(new Date());

  const [disputes, submitted, failedPayments, dbaHigh, kycPending, staleShifts, replacements, incassoClaims, upcomingBooked] = await Promise.all([
    prisma.dispute.findMany({
      where: { status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } },
      select: { id: true, reason: true, origin: true, createdAt: true, timesheet: { select: { branch: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
    prisma.timesheet.findMany({
      where: { status: "SUBMITTED" },
      select: { id: true, submittedAt: true, branch: { select: { name: true } }, freelancer: { select: { user: { select: { fullName: true } } } } },
      orderBy: { submittedAt: "asc" },
      take: 25,
    }),
    prisma.payment.findMany({
      where: { status: { in: ["FAILED", "RETURNED"] } },
      select: { id: true, amountCents: true, failureCode: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.dbaComplianceRecord.findMany({
      where: { riskLevel: "HIGH", createdAt: { gte: new Date(now - 30 * DAY) } },
      select: { id: true, rationale: true, createdAt: true, branch: { select: { name: true } }, freelancer: { select: { user: { select: { fullName: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.user.findMany({
      where: { kycStatus: "PENDING" },
      select: { id: true, fullName: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 15,
    }),
    prisma.shift.findMany({
      where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { lte: new Date(now + 2 * DAY), gte: new Date() }, ...zonderTest },
      select: { id: true, title: true, startsAt: true, positions: true, branch: { select: { name: true } }, _count: { select: { assignments: { where: { cancelledAt: null } } } } },
      orderBy: { startsAt: "asc" },
      take: 20,
    }),
    listReplacementRequests(50),
    claimsInIncasso(),
    prisma.shiftAssignment.findMany({
      where: { cancelledAt: null, shift: { endsAt: { gte: new Date() }, startsAt: { lte: new Date(now + 14 * DAY) } } },
      select: {
        freelancerId: true,
        shiftId: true,
        freelancer: { select: { user: { select: { fullName: true } } } },
        shift: { select: { title: true, startsAt: true, endsAt: true, branch: { select: { name: true } } } },
      },
      take: 2000,
    }),
  ]);

  for (const d of disputes) {
    items.push({
      id: `dispute-${d.id}`,
      kind: "Dispuut",
      severity: d.origin === "MOCK_LOCATION" ? "high" : "medium",
      title: `Dispuut — ${d.timesheet.branch.name}`,
      detail: d.reason.slice(0, 120),
      href: "/admin/disputes",
      at: d.createdAt.toISOString(),
    });
  }
  for (const p of failedPayments) {
    items.push({
      id: `pay-${p.id}`,
      kind: "Betaling",
      severity: "high",
      title: `Uitbetaling mislukt — € ${(p.amountCents / 100).toFixed(2)}`,
      detail: p.failureCode ?? "onbekende fout — retry loopt",
      href: "/admin",
      at: p.createdAt.toISOString(),
    });
  }
  for (const r of dbaHigh) {
    items.push({
      id: `dba-${r.id}`,
      kind: "Wet DBA",
      severity: "high",
      title: `Hoog risico — ${r.freelancer.user.fullName} · ${r.branch.name}`,
      detail: r.rationale.slice(0, 120),
      href: "/werkgever/compliance",
      at: r.createdAt.toISOString(),
    });
  }
  for (const rq of replacements.filter((x) => x.status === "open")) {
    items.push({
      id: `repl-${rq.id}`,
      kind: "Vervanger",
      severity: new Date(rq.startsAt).getTime() - now < DAY ? "high" : "medium",
      title: `Vervanger gevraagd — ${rq.shiftTitle}`,
      detail: `${rq.freelancerName} · ${rq.branch} · ${new Date(rq.startsAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}`,
      href: "/admin/mail",
      at: rq.at,
    });
  }
  for (const t of submitted) {
    items.push({
      id: `ts-${t.id}`,
      kind: "Uren",
      severity: "low",
      title: `Uren te keuren — ${t.freelancer.user.fullName}`,
      detail: t.branch.name,
      href: "/werkgever/uren",
      at: (t.submittedAt ?? new Date()).toISOString(),
    });
  }
  for (const u of kycPending) {
    items.push({
      id: `kyc-${u.id}`,
      kind: "KYC",
      severity: "low",
      title: `Identiteit in beoordeling — ${u.fullName}`,
      detail: "wacht op afronding verificatie",
      href: "/admin/audit",
      at: u.updatedAt.toISOString(),
    });
  }
  for (const c of incassoClaims) {
    items.push({
      id: `incasso-${c.id}`,
      kind: "Incasso",
      severity: "medium",
      title: `Incasso-dossier — ${c.shiftTitle}`,
      detail: `${c.branchName} · € ${(c.claimedCents / 100).toFixed(2)} + € ${((c.lateFeeCents ?? 0) / 100).toFixed(2)} incassokosten`,
      href: "/admin",
      at: c.overdueEscalatedAt ?? c.filedAt,
    });
  }
  // Dubbel ingepland (geboekt vóór de controle in lib/shifts/worker-overlap.ts): bel de werker, één van de twee moet eraf.
  const booked = upcomingBooked.map((a) => ({
    freelancerId: a.freelancerId,
    shiftId: a.shiftId,
    startsAt: a.shift.startsAt,
    endsAt: a.shift.endsAt,
    name: a.freelancer.user.fullName,
    label: `${a.shift.title} · ${a.shift.branch.name}`,
  }));
  for (const [a, b] of doubleBookedPairs(booked)) {
    items.push({
      id: `dubbel-${a.shiftId}-${b.shiftId}-${a.freelancerId}`,
      kind: "Dubbel",
      severity: a.startsAt.getTime() - now < 2 * DAY ? "high" : "medium",
      title: `Dubbel ingepland — ${a.name}`,
      detail: `${a.label} en ${b.label} · ${a.startsAt.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}`,
      href: "/admin/gebruikers",
      at: a.startsAt.toISOString(),
    });
  }
  for (const s of staleShifts.filter((x) => x._count.assignments < x.positions)) {
    items.push({
      id: `shift-${s.id}`,
      kind: "Bezetting",
      severity: s.startsAt.getTime() - now < DAY ? "high" : "medium",
      title: `Dienst nog niet vol — ${s.title}`,
      detail: `${s.branch.name} · ${s._count.assignments}/${s.positions} · ${s.startsAt.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}`,
      href: "/werkgever/diensten",
      at: s.startsAt.toISOString(),
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.at < b.at ? -1 : 1)).slice(0, 40);
}
