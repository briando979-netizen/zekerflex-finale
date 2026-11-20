import { prisma } from "@/lib/prisma";
import { safe, timelineKeys, type Period } from "@/lib/admin/period";
import { kindOf, type PersonKind } from "@/lib/admin/insights/people";
import {
  actieveAccountsPerDag,
  dekking,
  loginsPerDag,
  perGebruiker,
  scrolDiepte,
  telMeerdereDagen,
  telTerugkomers,
  tijdlijnVan,
  topLabels,
  uurVerdeling,
  volgendeNaVoorpagina,
  type EventRij,
  type GebruikerStand,
  type LoginRij,
} from "@/lib/analytics/meetkamer-kern";

// ---------------------------------------------------------------------------
// De cijfers achter Admin → Meetkamer (serverkant, leest prisma). Bronnen:
//  - AuditLog: elke inlog (auth.login.succeeded / failed / locked) met actorUserId
//  - AnalyticsEvent: pagina's, kliks en interacties van de eigen beacon, met userId
//    zodra iemand is ingelogd (components/analytics/AnalyticsBeacon.tsx)
// Alles blijft op onze eigen server; geen derde partij. Wat we per account laten
// zien staat in /privacy ("Diensten verbeteren").
// ---------------------------------------------------------------------------

const LOGIN_OK = "auth.login.succeeded";
const LOGIN_FOUT = ["auth.login.failed", "auth.login.locked"];
const MAX_INGELOGDE_EVENTS = 120_000;
const MAX_LOGINS = 50_000;
const ONLINE_MS = 5 * 60 * 1000;

export interface MeetkamerGebruiker extends GebruikerStand {
  naam: string;
  email: string;
  soort: PersonKind;
  lidSinds: Date;
  laatsteLoginOoit: Date | null;
  geblokkeerd: boolean;
}

export async function meetkamerData(period: Period) {
  const sinds5m = new Date(Date.now() - ONLINE_MS);
  const [users, loginRijen, foutRijen, ingelogdRijen, padTelling, homeKliks, homeScroll, homeWeergaven, homeSessies, onlineRijen, homePaginas] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, fullName: true, email: true, createdAt: true, lastLoginAt: true, disabledAt: true, memberships: { select: { role: true } } },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    safe(
      () =>
        prisma.auditLog.findMany({
          where: { action: LOGIN_OK, actorUserId: { not: null }, createdAt: { gte: period.from } },
          select: { actorUserId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: MAX_LOGINS,
        }),
      [] as { actorUserId: string | null; createdAt: Date }[],
    ),
    safe(
      () =>
        prisma.auditLog.findMany({
          where: { action: { in: LOGIN_FOUT }, actorUserId: { not: null }, createdAt: { gte: period.from } },
          select: { actorUserId: true, createdAt: true },
          take: MAX_LOGINS,
        }),
      [] as { actorUserId: string | null; createdAt: Date }[],
    ),
    safe(
      () =>
        prisma.analyticsEvent.findMany({
          where: { userId: { not: null }, createdAt: { gte: period.from } },
          select: { userId: true, sessionId: true, path: true, type: true, label: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: MAX_INGELOGDE_EVENTS,
        }),
      [] as { userId: string | null; sessionId: string; path: string; type: string; label: string | null; createdAt: Date }[],
    ),
    safe(
      async () =>
        (await prisma.analyticsEvent.groupBy({ by: ["path", "type"], where: { createdAt: { gte: period.from } }, _count: { _all: true } })).map((r) => ({ path: r.path, type: r.type as string, count: r._count._all })),
      [] as { path: string; type: string; count: number }[],
    ),
    safe(
      async () =>
        (await prisma.analyticsEvent.groupBy({ by: ["label"], where: { path: "/", type: "CLICK", createdAt: { gte: period.from } }, _count: { _all: true } })).map((r) => ({ label: r.label, count: r._count._all })),
      [] as { label: string | null; count: number }[],
    ),
    safe(
      async () =>
        (await prisma.analyticsEvent.groupBy({ by: ["label"], where: { path: "/", type: "INTERACTION", label: { startsWith: "scroll:" }, createdAt: { gte: period.from } }, _count: { _all: true } })).map((r) => ({ label: r.label, count: r._count._all })),
      [] as { label: string | null; count: number }[],
    ),
    safe(() => prisma.analyticsEvent.count({ where: { path: "/", type: "PAGEVIEW", createdAt: { gte: period.from } } }), 0),
    safe(
      async () => (await prisma.analyticsEvent.findMany({ where: { path: "/", type: "PAGEVIEW", createdAt: { gte: period.from } }, distinct: ["sessionId"], select: { sessionId: true, userId: true } })),
      [] as { sessionId: string; userId: string | null }[],
    ),
    safe(
      async () => (await prisma.analyticsEvent.findMany({ where: { userId: { not: null }, createdAt: { gte: sinds5m } }, distinct: ["userId"], select: { userId: true } })).map((r) => r.userId).filter((x): x is string => Boolean(x)),
      [] as string[],
    ),
    // de weg vanaf de voorpagina: alle paginaweergaven van sessies die de voorpagina zagen, hooguit de laatste 7 dagen (anders te groot)
    safe(
      async () => {
        const vanaf = new Date(Math.max(period.from.getTime(), Date.now() - 7 * 86_400_000));
        const sessies = (await prisma.analyticsEvent.findMany({ where: { path: "/", type: "PAGEVIEW", createdAt: { gte: vanaf } }, distinct: ["sessionId"], select: { sessionId: true }, take: 3000 })).map((r) => r.sessionId);
        if (sessies.length === 0) return [] as { sessionId: string; path: string; at: Date }[];
        const rijen = await prisma.analyticsEvent.findMany({ where: { type: "PAGEVIEW", sessionId: { in: sessies }, createdAt: { gte: vanaf } }, select: { sessionId: true, path: true, createdAt: true }, take: 40_000 });
        return rijen.map((r) => ({ sessionId: r.sessionId, path: r.path, at: r.createdAt }));
      },
      [] as { sessionId: string; path: string; at: Date }[],
    ),
  ]);

  const logins: LoginRij[] = [
    ...loginRijen.filter((r) => r.actorUserId).map((r) => ({ userId: r.actorUserId as string, at: r.createdAt, ok: true })),
    ...foutRijen.filter((r) => r.actorUserId).map((r) => ({ userId: r.actorUserId as string, at: r.createdAt, ok: false })),
  ];
  const events: EventRij[] = ingelogdRijen.map((r) => ({ userId: r.userId, sessionId: r.sessionId, path: r.path, type: r.type, label: r.label, at: r.createdAt }));
  const standen = perGebruiker(logins, events);

  const gebruikers: MeetkamerGebruiker[] = users.map((u) => {
    const s = standen.get(u.id) ?? { userId: u.id, logins: 0, mislukt: 0, eersteLogin: null, laatsteLogin: null, paginas: 0, kliks: 0, acties: 0, sessies: 0, laatstGezien: null, laatstePad: null, dagenActief: 0 };
    return { ...s, naam: u.fullName, email: u.email, soort: kindOf(u.memberships.map((m) => m.role)), lidSinds: u.createdAt, laatsteLoginOoit: u.lastLoginAt, geblokkeerd: Boolean(u.disabledAt) };
  });
  const actief = gebruikers.filter((g) => g.logins > 0 || g.paginas > 0 || g.kliks > 0 || g.acties > 0);
  const online = new Set(onlineRijen);

  return {
    labels: timelineKeys(period),
    totaal: users.length,
    afgekapt: users.length >= 2000 || ingelogdRijen.length >= MAX_INGELOGDE_EVENTS || loginRijen.length >= MAX_LOGINS,
    nieuw: users.filter((u) => u.createdAt >= period.from).length,
    actief: actief.length,
    ingelogd: gebruikers.filter((g) => g.logins > 0).length,
    terugkomers: telTerugkomers(standen.values()),
    meerdereDagen: telMeerdereDagen(standen.values()),
    nuOnline: online.size,
    loginsTotaal: logins.filter((l) => l.ok).length,
    loginsMislukt: logins.filter((l) => !l.ok).length,
    loginsPerDag: loginsPerDag(logins, period),
    actiefPerDag: actieveAccountsPerDag(logins, events, period),
    loginsPerUur: uurVerdeling(logins.filter((l) => l.ok).map((l) => l.at)),
    gedragPerUur: uurVerdeling(events.map((e) => e.at)),
    gebruikers,
    online,
    voorpagina: {
      weergaven: homeWeergaven,
      sessies: homeSessies.length,
      ingelogdeSessies: homeSessies.filter((s) => s.userId).length,
      kliks: topLabels(homeKliks, 30),
      kliksTotaal: homeKliks.reduce((s, r) => s + r.count, 0),
      scrol: scrolDiepte(homeScroll),
      volgende: volgendeNaVoorpagina(homePaginas),
    },
    dekking: dekking(padTelling, events),
    eventsTotaal: padTelling.reduce((s, r) => s + r.count, 0),
  };
}

export type MeetkamerData = Awaited<ReturnType<typeof meetkamerData>>;

/** Eén account: alles wat we in de periode van dit account zagen, als tijdlijn. */
export async function gebruikerTijdlijn(userId: string, period: Period) {
  const [user, audit, events] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, email: true, createdAt: true, lastLoginAt: true, disabledAt: true, memberships: { select: { role: true, tenant: { select: { name: true } } } } } }),
    safe(
      () =>
        prisma.auditLog.findMany({
          where: { actorUserId: userId, createdAt: { gte: period.from } },
          select: { id: true, action: true, summary: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
      [] as { id: string; action: string; summary: string; createdAt: Date }[],
    ),
    safe(
      () =>
        prisma.analyticsEvent.findMany({
          where: { userId, createdAt: { gte: period.from } },
          select: { sessionId: true, path: true, type: true, label: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 2000,
        }),
      [] as { sessionId: string; path: string; type: string; label: string | null; createdAt: Date }[],
    ),
  ]);
  if (!user) return null;
  const eventRijen: EventRij[] = events.map((e) => ({ userId, sessionId: e.sessionId, path: e.path, type: e.type, label: e.label, at: e.createdAt }));
  const logins: LoginRij[] = audit
    .filter((a) => a.action === LOGIN_OK || LOGIN_FOUT.includes(a.action))
    .map((a) => ({ userId, at: a.createdAt, ok: a.action === LOGIN_OK }));
  const stand = perGebruiker(logins, eventRijen).get(userId) ?? null;
  const paden = new Map<string, number>();
  for (const e of eventRijen) if (e.type === "PAGEVIEW") paden.set(e.path, (paden.get(e.path) ?? 0) + 1);
  const kliks = new Map<string, number>();
  for (const e of eventRijen) if (e.type === "CLICK" && e.label) kliks.set(e.label, (kliks.get(e.label) ?? 0) + 1);
  return {
    user: { ...user, soort: kindOf(user.memberships.map((m) => m.role)) },
    stand,
    tijdlijn: tijdlijnVan(audit.map((a) => ({ id: a.id, action: a.action, summary: a.summary, at: a.createdAt })), eventRijen),
    loginsPerUur: uurVerdeling(logins.filter((l) => l.ok).map((l) => l.at)),
    topPaden: [...paden.entries()].sort(([, a], [, b]) => b - a).slice(0, 12).map(([path, count]) => ({ path, count })),
    topKliks: [...kliks.entries()].sort(([, a], [, b]) => b - a).slice(0, 12).map(([label, count]) => ({ label, count })),
    afgekapt: events.length >= 2000 || audit.length >= 500,
  };
}
