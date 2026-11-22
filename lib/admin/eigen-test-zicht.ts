import { prisma } from "@/lib/prisma";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import type { EigenTest } from "@/lib/admin/eigen-test-kern";
import {
  GEEN_KIJKER,
  heeftEigenTest,
  isEigenTestBedrijf,
  kijkerUit,
  magKlusZien,
  magReageren,
  verborgenBedrijven,
  type Kijker,
} from "@/lib/admin/eigen-test-regel";

// ---------------------------------------------------------------------------
// De gegevens bij de grondregel voor de privé-accounts (lib/admin/eigen-test-regel.ts): wie kijkt er, en wie geldt als eigen
// test. Zolang er niets als eigen test gemarkeerd is (de gewone stand), vragen deze functies niets aan de database.
// ---------------------------------------------------------------------------

/** De kijker: eigen test, intern en van welke bedrijven lid. Eén vraag aan de database, alleen als er iets gemarkeerd is. */
export async function kijkerVan(userId: string, et?: EigenTest): Promise<Kijker> {
  const set = et ?? (await leesEigenTest());
  if (!heeftEigenTest(set)) return GEEN_KIJKER;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, memberships: { select: { role: true, tenantId: true } } },
  });
  return kijkerUit(set, { userId, email: u?.email ?? null, memberships: u?.memberships ?? [] });
}

/** De bedrijven waarvan deze gebruiker de klussen niet mag zien (voor `branch: { tenantId: { notIn } }`). Meestal leeg. */
export async function verborgenBedrijvenVoor(userId: string, et?: EigenTest): Promise<string[]> {
  const set = et ?? (await leesEigenTest());
  if (Object.keys(set.tenants).length === 0) return [];
  return verborgenBedrijven(set, await kijkerVan(userId, set));
}

/** Mag deze gebruiker de klus van dit bedrijf zien, en erop reageren? */
export async function klusToegang(userId: string, tenantId: string, et?: EigenTest): Promise<{ zien: boolean; reageren: boolean }> {
  const set = et ?? (await leesEigenTest());
  if (!heeftEigenTest(set)) return { zien: true, reageren: true };
  const kijker = await kijkerVan(userId, set);
  const klus = { tenantId, eigenTestBedrijf: isEigenTestBedrijf(set, tenantId) };
  return { zien: magKlusZien(kijker, klus), reageren: magReageren(kijker, klus) };
}

/**
 * Alle gebruikers die als eigen test gelden: de gemarkeerde accounts en de leden van een gemarkeerd bedrijf. Voor een melding
 * of een voorstel dat per gebruiker moet beslissen. Een storing bij het opzoeken van de leden geeft de gemarkeerde accounts
 * alleen: dit mag een melding nooit laten mislukken.
 */
export async function eigenTestGebruikerIds(et: EigenTest): Promise<string[]> {
  const ids = new Set(Object.keys(et.users));
  const tenants = Object.keys(et.tenants);
  if (tenants.length > 0) {
    try {
      const leden = await prisma.membership.findMany({ where: { tenantId: { in: tenants } }, select: { userId: true }, take: 500 });
      for (const l of leden) ids.add(l.userId);
    } catch {
      // de gemarkeerde accounts zelf staan er al in
    }
  }
  return [...ids];
}
