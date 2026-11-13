import { prisma } from "@/lib/prisma";
import { isTestklus } from "@/lib/shifts/testklus";
import { isEigenTestKlus } from "@/lib/admin/eigen-test-kern";
import { leesEigenTest } from "@/lib/admin/eigen-test";

// ---------------------------------------------------------------------------
// Testklussen en echte werkers. Achter een testklus (lib/shifts/testklus.ts)
// zit geen werk, maar de matching bood ze aan iedereen aan: op 9 nov waren 54
// voorstellen aan echte werkers ongezien verlopen, en die trokken daarna hun
// acceptatiescore omlaag (lib/worker/stats-sync.ts). Daarom:
//   - de matching en de dispatcher bieden een testklus alleen aan interne
//     accounts aan (testklusOntvangers): geen voorstel, push of mail meer
//     voor echte werkers;
//   - de acceptatiescore telt voorstellen voor een testklus niet mee (testklusIds).
// In de klussenlijst blijft een testklus zichtbaar, met label en uitleg.
// ---------------------------------------------------------------------------

/** Einde van het adres van testaccounts en van ZekerFlex zelf (zoals isReservedTestAddress in lib/mail). */
export const INTERNE_ADRESSEN = [
  ".test",
  ".example",
  ".invalid",
  ".localhost",
  "@localhost",
  "@example.com",
  "@zekerflex.com",
  "@zekerflex.nl",
] as const;

export interface TestklusOntvanger {
  freelancerId: string;
  userId: string;
}

/**
 * Werkers die een testklus wél als voorstel krijgen: beheer en verkoop van
 * ZekerFlex, leden van het bedrijf dat de testklus plaatste, en testadressen.
 * Een gewist account (disabledAt gezet, adres op .invalid) hoort er niet bij.
 */
export async function testklusOntvangers(tenantId: string): Promise<TestklusOntvanger[]> {
  const rows = await prisma.freelancerProfile.findMany({
    where: {
      user: {
        disabledAt: null,
        OR: [
          { memberships: { some: { OR: [{ role: { in: ["PLATFORM_ADMIN", "SALES"] } }, { tenantId }] } } },
          ...INTERNE_ADRESSEN.map((eind) => ({ email: { endsWith: eind, mode: "insensitive" as const } })),
        ],
      },
    },
    select: { id: true, userId: true },
    take: 500,
  });
  return rows.map((r) => ({ freelancerId: r.id, userId: r.userId }));
}

/**
 * Ids van de testklussen die vanaf `since` beginnen. Ruim zoeken in de database
 * ("test" in de titel of de bedrijfsnaam), precies beslissen met isTestklus.
 */
export async function testklusIds(since: Date): Promise<string[]> {
  // ook de bedrijven die het beheer als eigen test markeerde (lib/admin/eigen-test-kern.ts): hun klussen van daarna
  const eigenTest = await leesEigenTest();
  const eigen = Object.keys(eigenTest.tenants);
  const rows = await prisma.shift.findMany({
    where: {
      startsAt: { gte: since },
      OR: [
        { title: { contains: "test", mode: "insensitive" } },
        { branch: { tenant: { name: { contains: "test", mode: "insensitive" } } } },
        ...(eigen.length ? [{ branch: { tenantId: { in: eigen } } }] : []),
      ],
    },
    select: { id: true, title: true, createdAt: true, branch: { select: { tenantId: true, tenant: { select: { name: true } } } } },
    take: 5000,
  });
  return rows
    .filter((s) => isTestklus({ title: s.title, bedrijf: s.branch.tenant.name, eigenTest: isEigenTestKlus(eigenTest, { tenantId: s.branch.tenantId, createdAt: s.createdAt }) }))
    .map((s) => s.id);
}
