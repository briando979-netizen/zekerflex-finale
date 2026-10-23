import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/auth";
import { hasRole } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs/store";
import { offersForUser, listCounterOffers } from "@/lib/offers/store";
import { listReplacementRequests } from "@/lib/replacements/store";
import { listThreadsForUser, getMessages, unreadForUser } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { recentNotes } from "@/lib/bank/notify";
import { getDismissed, notifSignature } from "@/lib/notifications/dismissed";

// ---------------------------------------------------------------------------
// Per-account notification feed. Derived, read-only, no storage of its own —
// the client tracks "seen" via a localStorage timestamp.
// ---------------------------------------------------------------------------

export interface NotificationItem {
  id: string;
  kind: "chat" | "shift" | "offer" | "action" | "verification" | "info";
  title: string;
  body: string;
  href: string;
  at: string;
  urgent: boolean;
  /** optionele directe actie vanuit de melding, bv. komst bevestigen */
  action?: { type: "confirm"; id: string; label: string };
  /** thematische categorie voor de tabbladen in de meldingen-weergave */
  group?: "klussen" | "geld" | "berichten" | "account";
}

function groupOf(it: NotificationItem): NonNullable<NotificationItem["group"]> {
  if (it.kind === "chat") return "berichten";
  if (it.kind === "verification") return "account";
  if (it.kind === "info") return "geld";
  if (it.id.startsWith("ts:") || it.id.startsWith("emp:approve")) return "geld";
  return "klussen"; // shift, offer, en klus-acties (confirm, emp:shift)
}

export async function getNotifications(principal: Principal): Promise<NotificationItem[]> {
  const out: NotificationItem[] = [];
  const now = Date.now();
  const admin = await isPlatformAdmin(principal.userId);

  // ── unread chat (everyone) ────────────────────────────────────────
  try {
    const threads = await listThreadsForUser(principal.userId, admin);
    for (const t of threads.slice(0, 15)) {
      const msgs = await getMessages(t.id, 100);
      const unread = unreadForUser(t, msgs, principal.userId);
      if (unread > 0 && t.lastMessage) {
        out.push({
          id: `chat:${t.id}`,
          kind: "chat",
          title: t.kind === "support" ? "ZekerFlex Support" : t.meta.subject ?? "Nieuw bericht",
          body: `${unread} nieuw bericht${unread === 1 ? "" : "en"}: "${t.lastMessage.text.slice(0, 60)}"`,
          href: admin ? "/admin/berichten" : hasRole(principal, "FREELANCER") ? "/dashboard/berichten" : "/werkgever/berichten",
          at: t.lastMessage.at,
          urgent: false,
        });
      }
    }
  } catch {
    /* ignore */
  }

  if (hasRole(principal, "FREELANCER")) {
    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (profile) {
      const [prefs, assignments, actionTimesheets, replacements, offers, notChosen] = await Promise.all([
        getPrefs(principal.userId),
        prisma.shiftAssignment.findMany({
          where: {
            freelancerId: profile.id,
            cancelledAt: null,
            shift: { startsAt: { gte: new Date(), lte: new Date(now + 72 * 3600_000) } },
          },
          select: { id: true, shift: { select: { id: true, title: true, startsAt: true, branch: { select: { name: true } } } } },
        }),
        prisma.timesheet.findMany({
          where: { freelancerId: profile.id, status: { in: ["SUBMITTED", "DISPUTED"] } },
          select: { id: true, status: true, updatedAt: true },
        }),
        listReplacementRequests(300),
        offersForUser(principal.userId),
        // Matched/notified but the seat went to someone else, or the response
        // window expired — previously surfaced nowhere at all.
        prisma.shiftMatch.findMany({
          where: { freelancerId: profile.id, status: { in: ["DECLINED", "EXPIRED"] } },
          select: { id: true, respondedAt: true, expiresAt: true, createdAt: true, shift: { select: { id: true, title: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

      for (const a of assignments) {
        const inH = Math.round((a.shift.startsAt.getTime() - now) / 3600_000);
        const confirmed = Boolean(prefs.confirmations[a.id]);
        if (!confirmed) {
          out.push({
            id: `confirm:${a.id}`,
            kind: "action",
            title: "Bevestig je komst",
            body: `${a.shift.title} bij ${a.shift.branch.name} — over ${inH} uur`,
            href: "/dashboard/diensten",
            at: new Date(now).toISOString(),
            urgent: inH <= 24,
            action: { type: "confirm", id: a.id, label: "Bevestig komst" },
          });
        }
      }
      for (const t of actionTimesheets) {
        out.push({
          id: `ts:${t.id}`,
          kind: "action",
          title: t.status === "DISPUTED" ? "Dispuut over je uren" : "Uren in behandeling",
          body: t.status === "DISPUTED" ? "Er is een dispuut over een urenbriefje." : "Je ingediende uren wachten op goedkeuring.",
          href: "/dashboard/uitbetalingen",
          at: t.updatedAt.toISOString(),
          urgent: t.status === "DISPUTED",
        });
      }
      for (const o of offers) {
        if (o.status === "accepted") {
          out.push({
            id: `offer:${o.id}`,
            kind: "offer",
            title: "Tegenbod geaccepteerd",
            body: `${o.shiftTitle}: je tarief van € ${(o.proposedRateCents / 100).toFixed(2)}/u is akkoord. Neem de klus aan.`,
            href: `/dashboard/klussen/${o.shiftId}`,
            at: o.respondedAt ?? o.at,
            urgent: true,
          });
        } else if (o.status === "declined") {
          out.push({
            id: `offer:${o.id}`,
            kind: "offer",
            title: "Tegenbod afgewezen",
            body: `${o.shiftTitle}: het oorspronkelijke tarief blijft gelden.`,
            href: `/dashboard/klussen/${o.shiftId}`,
            at: o.respondedAt ?? o.at,
            urgent: false,
          });
        }
      }
      for (const m of notChosen) {
        out.push({
          id: `match:${m.id}`,
          kind: "shift",
          title: "Niet uitgekozen",
          body: `${m.shift.title}: deze klus is niet (meer) voor jou — een ander is gekozen of de reactietijd is verlopen.`,
          href: "/dashboard/diensten",
          at: (m.respondedAt ?? m.expiresAt ?? m.createdAt).toISOString(),
          urgent: false,
        });
      }
      const myOpenReplacements = replacements.filter((r) => r.userId === principal.userId && r.status === "open");
      for (const r of myOpenReplacements) {
        out.push({
          id: `repl:${r.id}`,
          kind: "shift",
          title: "Vervanger gezocht",
          body: `${r.shiftTitle}: je klus staat als "Vervanging" op het platform.`,
          href: "/dashboard/diensten",
          at: r.at,
          urgent: false,
        });
      }
    }
  }

  if (hasRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER") && !admin) {
    const scope = await resolveEmployerScope(principal);
    const bf = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
    const [toApprove, openShifts, myShifts] = await Promise.all([
      prisma.timesheet.count({ where: { branch: bf, status: "SUBMITTED" } }),
      prisma.shift.findMany({
        where: {
          branch: bf,
          status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
          startsAt: { gte: new Date(), lte: new Date(now + 48 * 3600_000) },
        },
        select: { id: true, title: true, startsAt: true, positions: true, _count: { select: { assignments: { where: { cancelledAt: null } } } } },
      }),
      // Pending counter-offers on THIS employer's shifts — getNotifications()
      // used to call offersForUser("__none__"), a literal placeholder id that
      // matches nothing, so a freelancer's "reactie" never reached the bell.
      prisma.shift.findMany({
        where: { branch: bf, startsAt: { gte: new Date(now - 24 * 3600_000) } },
        select: { id: true },
        take: 500,
      }),
    ]);
    const myShiftIds = new Set(myShifts.map((s) => s.id));
    const pendingOffers =
      myShiftIds.size > 0
        ? (await listCounterOffers(500)).filter((o) => o.status === "pending" && myShiftIds.has(o.shiftId))
        : [];
    for (const o of pendingOffers) {
      out.push({
        id: `emp:offer:${o.id}`,
        kind: "offer",
        title: "Nieuw tegenbod",
        body: `${o.freelancerName} biedt € ${(o.proposedRateCents / 100).toFixed(2)}/u voor ${o.shiftTitle}.`,
        href: `/werkgever/diensten/${o.shiftId}`,
        at: o.at,
        urgent: true,
      });
    }
    if (toApprove > 0) {
      out.push({
        id: "emp:approve",
        kind: "action",
        title: `${toApprove} urenbriefje${toApprove === 1 ? "" : "s"} te keuren`,
        body: "Keur goed zodat je krachten hun uitbetaling in gang kunnen zetten.",
        href: "/werkgever/uren",
        at: new Date(now).toISOString(),
        urgent: toApprove > 3,
      });
    }
    for (const s of openShifts) {
      const free = s.positions - s._count.assignments;
      const inH = Math.round((s.startsAt.getTime() - now) / 3600_000);
      if (free > 0) {
        out.push({
          id: `emp:shift:${s.id}`,
          kind: "shift",
          title: "Dienst nog niet vol",
          body: `${s.title}: ${free} plek(ken) open, start over ${inH} uur.`,
          href: `/werkgever/diensten/${s.id}`,
          at: new Date(now).toISOString(),
          urgent: inH <= 24,
        });
      }
    }
  }

  // ── ZekerFlex Bank (only an existing account — never opens one) ──
  try {
    const employerGrant = principal.grants.find((g) => ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(g.role));
    const account = admin
      ? null
      : await prisma.bankAccount.findUnique({
          where: employerGrant ? { tenantId: employerGrant.organizationId } : { userId: principal.userId },
          select: { id: true },
        });
    if (account) {
      const href = employerGrant ? "/werkgever/bank" : "/dashboard/bank";
      for (const n of (await recentNotes(account.id)).filter((n) => now - new Date(n.at).getTime() < 3 * 86_400_000).slice(0, 8)) {
        out.push({ id: `bank:${n.id}`, kind: "info", title: n.title, body: n.body, href, at: n.at, urgent: n.kind === "lowBalance" || n.title.includes("geweigerd") });
      }
    }
  } catch {
    /* ignore */
  }

  // Server-side "gelezen": filter weggeklikte meldingen vóór het afkappen op 25,
  // zodat de bel echt 25 zichtbare items kan tonen.
  const dismissed = await getDismissed(principal.userId).catch(() => new Set<string>());
  return out
    .filter((i) => !dismissed.has(notifSignature(i.id, i.body)))
    .sort((a, b) => (a.urgent === b.urgent ? (a.at < b.at ? 1 : -1) : a.urgent ? -1 : 1))
    .slice(0, 25)
    .map((i) => ({ ...i, group: groupOf(i) }));
}
