// ---------------------------------------------------------------------------
// Boekhouding: een administratie aanmaken. Elke entiteit (nu Zekerflex, Inc.) heeft eigen boeken, soort ECHT of TEST.
// De soort is daarna niet meer te wijzigen (trigger in de database). Geen relatie met Tenant/User/Invoice: zie de kop in
// prisma/schema.prisma.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { importeerBtwCodes, importeerRekeningschema } from "./rgs-import";
import type { BoekAdministratieSoortNaam } from "./types";
import { BOEK_SOORTEN } from "./types";

export interface NieuweAdministratie {
  naam: string;
  /** standaard ECHT */
  soort?: BoekAdministratieSoortNaam | undefined;
  /** functionele valuta, standaard EUR */
  valuta?: string | undefined;
  /** standaard gelijk aan naam */
  juridischeNaam?: string | undefined;
  /** ISO-landcode van de vestiging, standaard NL */
  land?: string | undefined;
  /** platform-tenant waarvan de facturen in deze administratie horen (hooguit één administratie per tenant) */
  platformTenantId?: string | undefined;
}

export interface AangemaakteAdministratie {
  id: string;
  soort: BoekAdministratieSoortNaam;
  rekeningen: number;
  btwCodes: number;
}

export async function maakAdministratie(invoer: NieuweAdministratie): Promise<AangemaakteAdministratie> {
  const naam = invoer.naam.trim();
  if (!naam || naam.length > 80) throw AppError.validation("De naam van de administratie is verplicht (hooguit 80 tekens).");
  const soort = invoer.soort ?? "ECHT";
  if (!(BOEK_SOORTEN as readonly string[]).includes(soort)) {
    throw AppError.validation("De soort van een administratie is ECHT of TEST.");
  }
  const valuta = invoer.valuta ?? "EUR";
  if (!/^[A-Z]{3}$/.test(valuta)) throw AppError.validation("De valuta is een code van drie hoofdletters, bijvoorbeeld EUR.");
  const land = invoer.land ?? "NL";
  if (!/^[A-Z]{2}$/.test(land)) throw AppError.validation("Het land is een code van twee hoofdletters, bijvoorbeeld NL of US.");
  const juridischeNaam = invoer.juridischeNaam?.trim() || naam;

  return prisma.$transaction(async (tx) => {
    const administratie = await tx.boekAdministratie.create({
      data: { naam, juridischeNaam, land, soort, valuta, ...(invoer.platformTenantId ? { platformTenantId: invoer.platformTenantId } : {}) },
      select: { id: true },
    });
    const rekeningen = await importeerRekeningschema(tx, administratie.id);
    const btwCodes = await importeerBtwCodes(tx, administratie.id);
    return { id: administratie.id, soort, rekeningen, btwCodes };
  });
}
