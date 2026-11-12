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
import { REACTIE_MARGE_MS } from "@/lib/offers/verval";
import { BANK_AAN } from "@/lib/app-mode";
import { afsprakenBelVoor } from "@/lib/afspraken/bel";
import { vulIn } from "@/lib/i18n/vul-in";
import { MELDING_NL, type MeldingTeksten } from "@/lib/notifications/feed-teksten";

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
  /**
   * De handtekening waarmee een weggeklikte melding wordt onthouden (lib/notifications/dismissed.ts): altijd uit de
   * NEDERLANDSE tekst, ook als de melding in een andere taal wordt getoond. Zo blijft weggeklikt wat al weggeklikt was.
   */
  sig?: string;
}

/**
 * Een melding voor een werker: de zinnen komen uit MeldingTeksten (zonder: Nederlands). `mk` maakt titel en tekst voor één
 * taal; de handtekening komt altijd uit de Nederlandse versie. Vrije tekst (klusnaam, chatbericht) gaat er als waarde in en
 * wordt dus nooit vertaald.
 */
function werkerMelding(
  basis: Omit<NotificationItem, "title" | "body" | "sig" | "action"> & { action?: { type: "confirm"; id: string } },
  teksten: MeldingTeksten,
  mk: (n: MeldingTeksten) => { title: string; body: string; actionLabel?: string },
): NotificationItem {
  const nl = mk(MELDING_NL);
  const tekst = teksten === MELDING_NL ? nl : mk(teksten);
  const { action, ...rest } = basis;
  return {
    ...rest,
    title: tekst.title,
    body: tekst.body,
    sig: notifSignature(basis.id, nl.body),
    ...(action ? { action: { ...action, label: tekst.actionLabel ?? "" } } : {}),
  };
}

/** Een tarief in de taal van de werker; in het Nederlands zoals het altijd stond ("18.00"). */
const tarief = (cents: number, n: MeldingTeksten): string =>
  n === MELDING_NL ? (cents / 100).toFixed(2) : (cents / 100).toLocaleString(n.intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function groupOf(it: NotificationItem): NonNullable<NotificationItem["group"]> {
  if (it.kind === "chat") return "berichten";
  if (it.kind === "verification") return "account";
  if (it.kind === "info") return "geld";
  if (it.id.startsWith("ts:") || it.id.startsWith("emp:approve")) return "geld";
  return "klussen"; // shift, offer, en klus-acties (confirm, emp:shift)
}

/**
 * `teksten`: de zinnen voor een werker in zijn app-taal (alleen de werkersmeldingen en de chatmelding van een werker); zonder
 * teksten Nederlands. Opdrachtgevers en beheer krijgen altijd de Nederlandse meldingen: geef hun geen teksten mee.
 */
export async function getNotifications(principal: Principal, teksten: MeldingTeksten = MELDING_NL): Promise<NotificationItem[]> {
  const out: NotificationItem[] = [];
  const now = Date.now();
  const admin = await isPlatformAdmin(principal.userId);

  // ── unread chat (everyone) ────────────────────────────────────────
  try {
    const threads = await listThreadsForUser(principal.userId, admin);
    // alleen een werker leest de zinnen in zijn taal; een opdrachtgever of beheerder houdt het Nederlands
    const chatTeksten = hasRole(principal, "FREELANCER") && !admin ? teksten : MELDING_NL;
    for (const thread of threads.slice(0, 15)) {
      const msgs = await getMessages(thread.id, 100);
      const unread = unreadForUser(thread, msgs, principal.userId);
      const last = thread.lastMessage;
      if (unread > 0 && last) {
        out.push(
          werkerMelding(
            {
              id: `chat:${thread.id}`,
              kind: "chat",
              href: admin ? "/admin/berichten" : hasRole(principal, "FREELANCER") ? "/dashboard/berichten" : "/werkgever/berichten",
              at: last.at,
              urgent: false,
            },
            chatTeksten,
            (n) => ({
              title: thread.kind === "support" ? "ZekerFlex Support" : thread.meta.subject ?? n.chatNieuw,
              body: vulIn(unread === 1 ? n.chatEen : n.chatMeer, { n: unread, tekst: last.text.slice(0, 60) }),
            }),
          ),
        );
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
          out.push(
            werkerMelding(
              { id: `confirm:${a.id}`, kind: "action", href: "/dashboard/diensten", at: new Date(now).toISOString(), urgent: inH <= 24, action: { type: "confirm", id: a.id } },
              teksten,
              (n) => ({ title: n.bevestigTitel, body: vulIn(n.bevestigBody, { klus: a.shift.title, bedrijf: a.shift.branch.name, uren: inH }), actionLabel: n.bevestigKnop }),
            ),
          );
        }
      }
      for (const t of actionTimesheets) {
        out.push(
          werkerMelding(
            { id: `ts:${t.id}`, kind: "action", href: "/dashboard/uitbetalingen", at: t.updatedAt.toISOString(), urgent: t.status === "DISPUTED" },
            teksten,
            (n) => (t.status === "DISPUTED" ? { title: n.urenDisputTitel, body: n.urenDisputBody } : { title: n.urenWachtTitel, body: n.urenWachtBody }),
          ),
        );
      }
      // Een antwoord op je reactie is een week nieuws; daarna staat het alleen nog in Mijn klussen
      // (zonder grens bleef "Tegenbod geaccepteerd" voor altijd in de bel staan).
      const recent = (at: string | null) => Boolean(at) && now - new Date(at ?? 0).getTime() < 7 * 24 * 3600_000;
      for (const o of offers) {
        if (o.status === "accepted" && recent(o.respondedAt)) {
          const tegenbod = o.proposedRateCents !== o.listedRateCents;
          out.push(
            werkerMelding(
              { id: `offer:${o.id}`, kind: "offer", href: `/dashboard/klussen/${o.shiftId}`, at: o.respondedAt ?? o.at, urgent: true },
              teksten,
              (n) =>
                tegenbod
                  ? { title: n.tegenbodOkTitel, body: vulIn(n.tegenbodOkBody, { klus: o.shiftTitle, tarief: tarief(o.proposedRateCents, n) }) }
                  : { title: n.uitgekozenTitel, body: vulIn(n.uitgekozenBody, { klus: o.shiftTitle }) },
            ),
          );
        } else if (o.status === "declined" && recent(o.respondedAt)) {
          // een gewone reactie (tegen het aangeboden tarief) is geen tegenbod
          const tegenbod = o.proposedRateCents !== o.listedRateCents;
          out.push(
            werkerMelding(
              { id: `offer:${o.id}`, kind: "offer", href: tegenbod ? `/dashboard/klussen/${o.shiftId}` : "/dashboard/klussen", at: o.respondedAt ?? o.at, urgent: false },
              teksten,
              (n) =>
                tegenbod
                  ? { title: n.tegenbodNeeTitel, body: vulIn(n.tegenbodNeeBody, { klus: o.shiftTitle }) }
                  : { title: n.nietUitgekozenTitel, body: vulIn(n.nietUitgekozenBody, { klus: o.shiftTitle }) },
            ),
          );
        } else if (o.status === "expired" && recent(o.respondedAt)) {
          // de klus begon zonder keuze (lib/offers/expire.ts); een week zichtbaar
          out.push(
            werkerMelding(
              { id: `offer:${o.id}`, kind: "offer", href: "/dashboard/klussen", at: o.respondedAt ?? o.at, urgent: false },
              teksten,
              (n) => ({ title: n.helaasTitel, body: vulIn(n.helaasBody, { klus: o.shiftTitle }) }),
            ),
          );
        }
      }
      for (const m of notChosen) {
        if (!recent((m.respondedAt ?? m.expiresAt ?? m.createdAt).toISOString())) continue;
        out.push(
          werkerMelding(
            { id: `match:${m.id}`, kind: "shift", href: "/dashboard/diensten", at: (m.respondedAt ?? m.expiresAt ?? m.createdAt).toISOString(), urgent: false },
            teksten,
            (n) => ({ title: n.matchTitel, body: vulIn(n.matchBody, { klus: m.shift.title }) }),
          ),
        );
      }
      const myOpenReplacements = replacements.filter((r) => r.userId === principal.userId && r.status === "open");
      for (const r of myOpenReplacements) {
        out.push(
          werkerMelding(
            { id: `repl:${r.id}`, kind: "shift", href: "/dashboard/diensten", at: r.at, urgent: false },
            teksten,
            (n) => ({ title: n.vervangerTitel, body: vulIn(n.vervangerBody, { klus: r.shiftTitle }) }),
          ),
        );
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
      // alleen klussen waarop je nog kunt kiezen: na de start + marge vervalt een reactie (lib/offers/verval.ts)
      prisma.shift.findMany({
        where: { branch: bf, startsAt: { gte: new Date(now - REACTIE_MARGE_MS) } },
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
        title: o.proposedRateCents !== o.listedRateCents ? "Nieuw tegenbod" : "Nieuwe reactie",
        body:
          o.proposedRateCents !== o.listedRateCents
            ? `${o.freelancerName} biedt € ${(o.proposedRateCents / 100).toFixed(2)}/u voor ${o.shiftTitle}.`
            : `${o.freelancerName} wil ${o.shiftTitle} doen. Kies voor de klus begint.`,
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

  // ── nieuwe online afspraken (alleen de beheerder, net als de afsprakenpagina en de push/mail) ──
  if (hasRole(principal, "HQ_ADMIN") && !admin) {
    try {
      const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
      if (tenantId) out.push(...(await afsprakenBelVoor(tenantId, new Date(now))));
    } catch {
      /* ignore: de bel werkt ook zonder afspraken */
    }
  }

  // ── ZekerFlex Bank (only an existing account — never opens one) ──
  // De bank staat uit (lib/app-mode.ts, BANK_AAN): dan ook geen bankmeldingen meer.
  if (BANK_AAN) try {
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
    .filter((i) => !dismissed.has(i.sig ?? notifSignature(i.id, i.body)))
    .sort((a, b) => (a.urgent === b.urgent ? (a.at < b.at ? 1 : -1) : a.urgent ? -1 : 1))
    .slice(0, 25)
    .map((i) => ({ ...i, sig: i.sig ?? notifSignature(i.id, i.body), group: groupOf(i) }));
}
