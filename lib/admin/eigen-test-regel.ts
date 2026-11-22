import { isTestklus } from "@/lib/shifts/testklus";
import { isEigenTestAccount, isEigenTestKlus, type EigenTest } from "@/lib/admin/eigen-test-kern";

// ---------------------------------------------------------------------------
// De grondregel voor de privé-accounts van de eigenaar (22 nov 2026: "ik moet toch wel kunnen testen en ik wil bedrijven
// hebben"). Een werker en een bedrijf die in Beheer als "Eigen test" staan, schrijven echt (klus plaatsen, reageren, kiezen,
// inchecken, uren goedkeuren), maar nooit zichtbaar voor echte gebruikers, en echte gebruikers nooit voor hen:
//   - een klus van een eigen-testbedrijf is alleen zichtbaar en reageerbaar voor eigen-test-accounts en interne accounts
//     (beheer, verkoop, leden van het bedrijf zelf, testadressen);
//   - een eigen-test-werker reageert alleen op klussen van eigen-testbedrijven, en wordt voor een klus van een echt bedrijf
//     niet gematcht, niet gemeld en niet ingepland.
// Dan is zelfs een vergeten privé-pool of een klus die per ongeluk openbaar staat geen lek meer. Puur: de set komt uit
// lib/admin/eigen-test.ts (KV systeem:eigen-test), de gegevens van de kijker uit lib/admin/eigen-test-zicht.ts.
// Een eigen-testbedrijf geldt hier voor al zijn klussen (ook van vóór de markering); isEigenTestKlus (alleen vanaf de markering)
// blijft voor de cijfers.
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

/** Is dit een intern adres (een testadres of een adres van ZekerFlex zelf)? */
export function isInternAdres(email: string | null | undefined): boolean {
  const adres = (email ?? "").trim().toLowerCase();
  return adres.length > 0 && INTERNE_ADRESSEN.some((eind) => adres.endsWith(eind));
}

/** Staat er iets als eigen test gemarkeerd? Zo niet, dan hoeft geen enkele controle iets op te vragen. */
export function heeftEigenTest(et: EigenTest | null): boolean {
  return Boolean(et) && (Object.keys(et?.tenants ?? {}).length > 0 || Object.keys(et?.users ?? {}).length > 0);
}

/** Is dit bedrijf als eigen test gemarkeerd? (Object.hasOwn: "constructor" is geen bedrijf.) */
export function isEigenTestBedrijf(et: EigenTest | null, tenantId: string | null | undefined): boolean {
  return Boolean(et && tenantId && Object.hasOwn(et.tenants, tenantId));
}

/** Wie een klus bekijkt of erop reageert. */
export interface Kijker {
  /** het account zelf, of een van zijn bedrijven, staat als eigen test gemarkeerd */
  eigenTest: boolean;
  /** beheer, verkoop of een intern adres: ziet elke klus van een eigen-testbedrijf */
  intern: boolean;
  /** de bedrijven waar de kijker lid van is: de klussen van het eigen bedrijf ziet hij altijd */
  lidVan: readonly string[];
}

/** Een gewone gebruiker: niet eigen test, niet intern, bij geen enkel bedrijf. */
export const GEEN_KIJKER: Kijker = { eigenTest: false, intern: false, lidVan: [] };

/** De kijker uit wat de database van het account weet (e-mailadres en lidmaatschappen). */
export function kijkerUit(
  et: EigenTest | null,
  g: { userId: string; email: string | null | undefined; memberships: readonly { role: string; tenantId: string }[] },
): Kijker {
  const tenantIds = g.memberships.map((m) => m.tenantId);
  return {
    eigenTest: isEigenTestAccount(et, { userId: g.userId, tenantIds }),
    intern: g.memberships.some((m) => m.role === "PLATFORM_ADMIN" || m.role === "SALES") || isInternAdres(g.email),
    lidVan: tenantIds,
  };
}

/** De klus waar het om gaat: van welk bedrijf, en of dat bedrijf als eigen test gemarkeerd is. */
export interface KlusBedrijf {
  tenantId: string;
  eigenTestBedrijf: boolean;
}

/** Mag de kijker deze klus zien? Een klus van een echt bedrijf mag iedereen zien. */
export function magKlusZien(kijker: Kijker, klus: KlusBedrijf): boolean {
  if (!klus.eigenTestBedrijf) return true;
  return kijker.eigenTest || kijker.intern || kijker.lidVan.includes(klus.tenantId);
}

/**
 * Mag deze werker op de klus reageren (en dus worden gematcht, gemeld en ingepland)? Een klus van een eigen-testbedrijf alleen
 * als hij hem mag zien; een klus van een echt bedrijf nooit voor een eigen-test-account.
 */
export function magReageren(werker: Kijker, klus: KlusBedrijf): boolean {
  if (klus.eigenTestBedrijf) return magKlusZien(werker, klus);
  return !werker.eigenTest;
}

/** De bedrijven waarvan deze kijker de klussen niet mag zien: voor een `branch: { tenantId: { notIn } }` in een zoekopdracht. */
export function verborgenBedrijven(et: EigenTest | null, kijker: Kijker): string[] {
  return Object.keys(et?.tenants ?? {}).filter((tenantId) => !magKlusZien(kijker, { tenantId, eigenTestBedrijf: true }));
}

/**
 * Hoort deze klus nooit in een openbare telling, lijst of bericht (open diensten, weekfeiten voor sociale media)? Een testklus
 * (herkend aan naam of markering) en elke klus van een eigen-testbedrijf.
 */
export function isNietOpenbaar(
  et: EigenTest | null,
  s: { title: string; bedrijf?: string | null; tenantId: string; createdAt: Date | string | null | undefined },
): boolean {
  return (
    isEigenTestBedrijf(et, s.tenantId) ||
    isTestklus({ title: s.title, bedrijf: s.bedrijf ?? null, eigenTest: isEigenTestKlus(et, { tenantId: s.tenantId, createdAt: s.createdAt }) })
  );
}

/** Een voorwaarde waaraan een gebruiker als eigen test geldt, als Prisma-filter op een gebruiker. */
export type EigenTestVoorwaarde = { id: { in: string[] } } | { memberships: { some: { tenantId: { in: string[] } } } };

/** De voorwaarden (zelf gemarkeerd, of lid van een gemarkeerd bedrijf). Leeg zolang er niets gemarkeerd is. */
export function eigenTestVoorwaarden(et: EigenTest | null): EigenTestVoorwaarde[] {
  const users = Object.keys(et?.users ?? {});
  const tenants = Object.keys(et?.tenants ?? {});
  return [
    ...(users.length ? [{ id: { in: users } }] : []),
    ...(tenants.length ? [{ memberships: { some: { tenantId: { in: tenants } } } }] : []),
  ];
}

/**
 * Voor een gebruikersfilter in Prisma: zonder de eigen-test-accounts. Leeg zolang er niets gemarkeerd is. Staat onder `AND`,
 * zodat het naast `...zonderTestwerker()` (dat `NOT` gebruikt) kan.
 * Gebruik: `user: { disabledAt: null, ...zonderEigenTestAccounts(et) }`.
 */
export function zonderEigenTestAccounts(et: EigenTest | null): { AND?: { NOT: { OR: EigenTestVoorwaarde[] } }[] } {
  const voorwaarden = eigenTestVoorwaarden(et);
  return voorwaarden.length ? { AND: [{ NOT: { OR: voorwaarden } }] } : {};
}
