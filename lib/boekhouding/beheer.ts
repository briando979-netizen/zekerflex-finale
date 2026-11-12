// ---------------------------------------------------------------------------
// Boekhouding: beheer door de platformbeheerder (alleen via /api/admin/boekhouding). Administraties aanmaken en
// opsommen, openstaande facturen laten boeken (de rooktest) en een TEST-administratie wissen. Een ECHTE administratie
// maak je alleen met een expliciete bevestigingstekst, en kan nooit gewist worden. Geen persoonsgegevens in de uitvoer.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { maakAdministratie, type AangemaakteAdministratie } from "./administratie";
import { boekOpenFacturen, type OpenFacturenResultaat } from "./inkomsten";
import { wisTestAdministratie, type WisUitkomst } from "./test-wissen";

/** De tekst die de beheerder letterlijk moet meesturen om een ECHTE administratie aan te maken. */
export const BEVESTIG_ECHT = "ECHT AANMAKEN";
export const TEST_VOORVOEGSEL = "TEST ";
export const MAX_FACTUREN_PER_AANROEP = 200;

export interface AdministratieOverzicht {
  id: string;
  soort: "ECHT" | "TEST";
  naam: string;
  valuta: string;
  actief: boolean;
  heeftPlatformTenant: boolean;
  boekingen: number;
  vergrendeldeMaanden: string[];
}

const maandSleutel = (jaar: number, maand: number): string => `${jaar}-${String(maand).padStart(2, "0")}`;

export async function lijstAdministraties(): Promise<AdministratieOverzicht[]> {
  const rijen = await prisma.boekAdministratie.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      soort: true,
      naam: true,
      valuta: true,
      actief: true,
      platformTenantId: true,
      _count: { select: { boekingen: true } },
      perioden: { where: { status: "VERGRENDELD" }, orderBy: [{ jaar: "asc" }, { maand: "asc" }], select: { jaar: true, maand: true } },
    },
  });
  return rijen.map((r) => ({
    id: r.id,
    soort: r.soort,
    naam: r.naam,
    valuta: r.valuta,
    actief: r.actief,
    heeftPlatformTenant: r.platformTenantId !== null,
    boekingen: r._count.boekingen,
    vergrendeldeMaanden: r.perioden.map((p) => maandSleutel(p.jaar, p.maand)),
  }));
}

export interface BeheerNieuw {
  naam: string;
  soort: "ECHT" | "TEST";
  valuta?: string | undefined;
  platformTenantId?: string | undefined;
  bevestig?: string | undefined;
}

export async function maakAdministratieAlsBeheerder(invoer: BeheerNieuw): Promise<AangemaakteAdministratie & { naam: string }> {
  const basis = invoer.naam.trim();
  if (!basis) throw AppError.validation("De naam van de administratie is verplicht.");
  let naam = basis;

  if (invoer.soort === "ECHT") {
    if (invoer.bevestig !== BEVESTIG_ECHT) {
      throw AppError.validation(`Een echte administratie maak je alleen met een bevestiging: stuur bevestig: "${BEVESTIG_ECHT}" mee.`);
    }
    if (!invoer.platformTenantId) {
      throw AppError.validation("Voor een echte administratie is de platform-tenant verplicht (platformTenantId).");
    }
    const dubbel = await prisma.boekAdministratie.findFirst({
      where: { soort: "ECHT", OR: [{ naam: { equals: naam, mode: "insensitive" } }, { platformTenantId: invoer.platformTenantId }] },
      select: { id: true },
    });
    if (dubbel) throw AppError.conflict("Er is al een echte administratie met deze naam of voor deze tenant. Er komt er geen tweede bij.");
  } else if (!naam.toUpperCase().startsWith(TEST_VOORVOEGSEL)) {
    naam = `${TEST_VOORVOEGSEL}${naam}`;
  }
  if (naam.length > 80) throw AppError.validation("De naam van de administratie is te lang (hooguit 80 tekens, inclusief TEST).");

  if (invoer.platformTenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: invoer.platformTenantId }, select: { id: true } });
    if (!tenant) throw AppError.validation("Deze platform-tenant bestaat niet.");
    const bezet = await prisma.boekAdministratie.findFirst({ where: { platformTenantId: invoer.platformTenantId }, select: { soort: true } });
    if (bezet) {
      throw AppError.conflict(
        `Deze tenant is al gekoppeld aan een ${bezet.soort === "TEST" ? "testadministratie (wis die eerst)" : "echte administratie"}: een tenant hoort bij hooguit één administratie.`,
      );
    }
  }

  const gemaakt = await maakAdministratie({
    naam,
    soort: invoer.soort,
    valuta: invoer.valuta,
    platformTenantId: invoer.platformTenantId,
  });
  return { ...gemaakt, naam };
}

export interface FacturenUitkomst {
  geboekt: { nieuweFacturen: number; nieuweBetalingen: number; nieuweTegenboekingen: number };
  alGeboekt: number;
  overgeslagen: number;
  verwerkt: number;
  /** alleen factuurnummer en een korte foutmelding, nooit klantgegevens */
  fouten: { nummer: string; fout: string }[];
}

export function uitkomstZonderKlantgegevens(r: OpenFacturenResultaat): FacturenUitkomst {
  return {
    geboekt: { nieuweFacturen: r.nieuweFacturen, nieuweBetalingen: r.nieuweBetalingen, nieuweTegenboekingen: r.nieuweTegenboekingen },
    alGeboekt: r.alGeboekt,
    overgeslagen: r.overgeslagen,
    verwerkt: r.verwerkt,
    fouten: r.fouten.map((f) => ({ nummer: f.nummer, fout: f.fout.slice(0, 200) })),
  };
}

export async function boekFacturenAlsBeheerder(invoer: {
  administratieId: string;
  sinds?: Date | undefined;
  limiet?: number | undefined;
}): Promise<FacturenUitkomst> {
  const limiet = Math.min(Math.max(Math.trunc(invoer.limiet ?? MAX_FACTUREN_PER_AANROEP), 1), MAX_FACTUREN_PER_AANROEP);
  const r = await boekOpenFacturen(invoer.administratieId, { limiet, ...(invoer.sinds ? { sinds: invoer.sinds } : {}) });
  return uitkomstZonderKlantgegevens(r);
}

export async function wisTestAlsBeheerder(administratieId: string): Promise<WisUitkomst> {
  const a = await prisma.boekAdministratie.findUnique({ where: { id: administratieId }, select: { soort: true } });
  if (!a) throw AppError.notFound("Deze administratie bestaat niet.");
  if (a.soort !== "TEST") {
    throw new AppError(
      "ECHT_ONVERANDERLIJK",
      "Een echte administratie wordt nooit gewist: de boeken blijven bewaard. Alleen een testadministratie kan gewist worden.",
      409,
    );
  }
  return wisTestAdministratie(administratieId);
}
