import { prisma } from "@/lib/prisma";
import { ERASED_EMAIL_DOMAIN } from "@/lib/privacy/anonymize";
import { vertrekredenLabel } from "@/lib/privacy/vertrekredenen";
import { kindOf, type PersonKind } from "@/lib/admin/insights/people";
import type { Period } from "@/lib/admin/period";

// ---------------------------------------------------------------------------
// Admin → Gebruikers → Verwijderde accounts. Wie zijn account verwijdert, wordt
// geanonimiseerd (lib/privacy/anonymize.ts): naam, e-mail en telefoon zijn weg,
// zoals de AVG vereist. Wat wél blijft en hier staat: wanneer, wat voor gebruiker
// (rol), hoe lang lid, laatst actief, hoeveel diensten gewerkt (de uren hebben
// een wettelijke bewaarplicht), wie het verwijderde en de vrijwillige vertrekreden.
// Alles komt uit gegevens die er al zijn; er wordt niets extra bewaard.
// ---------------------------------------------------------------------------

const LIMIET = 500;

export type VerwijderdDoor = "zelf" | "beheer" | "systeem";

export interface VerwijderdAccount {
  id: string;
  verwijderdOp: Date | null;
  lidSinds: Date;
  /** hele dagen tussen aanmelden en verwijderen */
  dagenLid: number | null;
  laatstIngelogd: Date | null;
  soort: PersonKind;
  door: VerwijderdDoor;
  reden: string | null;
  diensten: number;
}

/** Wie verwijderde het account? Uit de auditregel van het anonimiseren. */
export function doorVan(userId: string, actorUserId: string | null, summary: string): VerwijderdDoor {
  if (actorUserId && actorUserId !== userId) return "beheer";
  if (actorUserId === userId || /zelf verwijderd/i.test(summary)) return "zelf";
  return "systeem";
}

export function dagenTussen(van: Date, tot: Date | null): number | null {
  if (!tot) return null;
  return Math.max(0, Math.floor((tot.getTime() - van.getTime()) / 86_400_000));
}

export async function verwijderdeAccounts(period: Period): Promise<{ rijen: VerwijderdAccount[]; totaal: number; inPeriode: number; afgekapt: boolean }> {
  const waar = { email: { endsWith: `@${ERASED_EMAIL_DOMAIN}` } };
  const [users, totaal, inPeriode] = await Promise.all([
    prisma.user.findMany({
      where: waar,
      orderBy: [{ disabledAt: "desc" }, { createdAt: "desc" }],
      take: LIMIET,
      select: {
        id: true,
        createdAt: true,
        disabledAt: true,
        lastLoginAt: true,
        memberships: { select: { role: true } },
        freelancerProfile: { select: { id: true } },
      },
    }),
    prisma.user.count({ where: waar }),
    prisma.user.count({ where: { ...waar, disabledAt: { gte: period.from } } }),
  ]);

  const ids = users.map((u) => u.id);
  const profielIds = users.flatMap((u) => (u.freelancerProfile ? [u.freelancerProfile.id] : []));
  const [audits, uren] = await Promise.all([
    ids.length
      ? prisma.auditLog.findMany({
          where: { action: "privacy.user.erased", targetId: { in: ids } },
          select: { targetId: true, actorUserId: true, summary: true, metadata: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    profielIds.length
      ? prisma.timesheet.groupBy({ by: ["freelancerId"], where: { freelancerId: { in: profielIds } }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);

  const auditVan = new Map<string, (typeof audits)[number]>();
  for (const a of audits) if (a.targetId && !auditVan.has(a.targetId)) auditVan.set(a.targetId, a);
  const dienstenVan = new Map(uren.map((g) => [g.freelancerId, g._count._all]));

  const rijen = users.map((u): VerwijderdAccount => {
    const a = auditVan.get(u.id);
    const meta = a?.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata) ? (a.metadata as Record<string, unknown>) : {};
    const rollen = u.memberships.map((m) => m.role as string);
    return {
      id: u.id,
      verwijderdOp: u.disabledAt,
      lidSinds: u.createdAt,
      dagenLid: dagenTussen(u.createdAt, u.disabledAt),
      laatstIngelogd: u.lastLoginAt,
      soort: rollen.length ? kindOf(rollen) : u.freelancerProfile ? "flexwerker" : "overig",
      door: a ? doorVan(u.id, a.actorUserId, a.summary) : "systeem",
      reden: vertrekredenLabel(meta.vertrekreden),
      diensten: u.freelancerProfile ? (dienstenVan.get(u.freelancerProfile.id) ?? 0) : 0,
    };
  });

  return { rijen, totaal, inPeriode, afgekapt: totaal > users.length };
}

/** "12 dagen", "3 maanden", "2 jaar": hoe lang iemand lid was. */
export function duurNl(dagen: number | null): string {
  if (dagen === null) return "Onbekend";
  if (dagen < 1) return "Minder dan een dag";
  if (dagen === 1) return "1 dag";
  if (dagen < 60) return `${dagen} dagen`;
  if (dagen < 730) return `${Math.round(dagen / 30)} maanden`;
  return `${Math.floor(dagen / 365)} jaar`;
}
