import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Mag iemand zijn eigen account verwijderen zonder een bedrijf vast te laten lopen (15 nov 2026)? Het verwijderen
// (lib/privacy/anonymize.ts) wist de persoon, niet het bedrijf: bedrijfsprofiel, locaties, diensten en facturen blijven
// (bewaarplicht). Wie de ENIGE beheerder (HQ_ADMIN) is, laat anders een bedrijf achter dat niemand meer kan beheren:
// collega's zonder beheerder, of geplande diensten waarvan niemand de uren goedkeurt. Dan eerst een collega beheerder
// maken of de diensten afronden. Geldt voor beide ingangen (werkersapp en werkgeversapp), want het is dezelfde actie.
// ---------------------------------------------------------------------------

export type VertrekBlok = { reden: "collegas" | "diensten"; aantal: number; bedrijf: string };

/** Diensten die nog moeten gebeuren of lopen: niet afgerond en niet geannuleerd. */
const NOG_OPEN = ["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED", "FILLED", "IN_PROGRESS"] as const;

export async function bedrijfBlokkeertVertrek(userId: string, nu: Date = new Date()): Promise<VertrekBlok | null> {
  const beheer = await prisma.membership.findMany({
    where: { userId, role: "HQ_ADMIN" },
    select: { tenantId: true, tenant: { select: { name: true } } },
  });
  for (const m of beheer) {
    const andereBeheerders = await prisma.membership.count({
      where: { tenantId: m.tenantId, role: "HQ_ADMIN", userId: { not: userId }, user: { disabledAt: null } },
    });
    if (andereBeheerders > 0) continue;
    const collegas = await prisma.membership.findMany({
      where: { tenantId: m.tenantId, userId: { not: userId }, user: { disabledAt: null } },
      select: { userId: true },
      distinct: ["userId"],
    });
    if (collegas.length > 0) return { reden: "collegas", aantal: collegas.length, bedrijf: m.tenant.name };
    const diensten = await prisma.shift.count({
      where: { branch: { tenantId: m.tenantId }, status: { in: [...NOG_OPEN] }, endsAt: { gte: nu } },
    });
    if (diensten > 0) return { reden: "diensten", aantal: diensten, bedrijf: m.tenant.name };
  }
  return null;
}
