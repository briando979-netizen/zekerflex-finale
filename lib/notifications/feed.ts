import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/auth";
import { hasRole } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs/store";
import { offersForUser } from "@/lib/offers/store";
import { listReplacementRequests } from "@/lib/replacements/store";
import { listThreadsForUser, getMessages, unreadForUser } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { resolveEmployerScope } from "@/lib/dashboard/employer";

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
      const [prefs, assignments, actionTimesheets, replacements, offers] = await Promise.all([
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
    const [toApprove, openShifts, offers] = await Promise.all([
      prisma.timesheet.count({ where: { branch: bf, status: "SUBMITTED" } }),
      prisma.shift.findMany({
        where: {
          branch: bf,
          status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
          startsAt: { gte: new Date(), lte: new Date(now + 48 * 3600_000) },
        },
        select: { id: true, title: true, startsAt: true, positions: true, _count: { select: { assignments: { where: { cancelledAt: null } } } } },
      }),
      offersForUser("__none__").catch(() => []),
    ]);
    void offers;
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

  return out
    .sort((a, b) => (a.urgent === b.urgent ? (a.at < b.at ? 1 : -1) : a.urgent ? -1 : 1))
    .slice(0, 25);
}
