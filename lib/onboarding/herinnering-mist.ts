import { prisma } from "@/lib/prisma";
import { getFiscal, fiscaalIngevuld, invoiceModeFor } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { herinneringMist, type MistStuk } from "@/lib/onboarding/herinnering-teksten";

// De feiten achter de herinnering aan een werker (12 nov 2026): wat mist er precies? De top-regels komen van de poort
// (werkerPoortStand), alleen het detail van "gegevens" (BSN, overeenkomst, btw/KOR, postcode) wordt hier erbij gehaald, met
// dezelfde regels als de poort (lib/onboarding/werker-poort-server.ts). Een storing in een bron telt als "niet te herinneren":
// liever geen mail dan een onware.

/** Wat de werker nog moet doen voor zijn aanmelding; leeg = klaar (of niets wat we kunnen noemen). */
export async function werkerMist(userId: string): Promise<MistStuk[]> {
  const stand = await werkerPoortStand(userId);
  if (stand.klaar) return [];
  let gegevens = null;
  if (stand.soortGekozen && !stand.gegevensIngevuld) {
    const [fiscal, profiel] = await Promise.all([
      getFiscal(userId),
      prisma.freelancerProfile.findUnique({ where: { userId }, select: { kvkValid: true, kvkNumber: true, homePostalCode: true } }),
    ]);
    const uitzend = invoiceModeFor(fiscal) === "payroll";
    gegevens = {
      soort: fiscal.workerKind ?? null,
      fiscaalIngevuld: fiscaalIngevuld(fiscal),
      contractGetekend: uitzend ? Boolean(await activeUitzendContract(userId).catch(() => true)) : true,
      bedrijfOk: Boolean(profiel?.kvkValid || /^\d{8}$/.test(profiel?.kvkNumber ?? "") || fiscal.vatValid || fiscal.korApplies),
      postcodeOk: Boolean(profiel?.homePostalCode),
    };
  }
  return herinneringMist({
    soortGekozen: stand.soortGekozen,
    branchesGekozen: stand.branchesGekozen,
    identiteitIngestuurd: stand.identiteitIngestuurd,
    fotoGezet: stand.fotoGezet,
    gegevens,
  });
}
