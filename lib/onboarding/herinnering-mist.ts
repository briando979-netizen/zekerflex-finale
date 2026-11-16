import { prisma } from "@/lib/prisma";
import { getFiscal, fiscaalIngevuld, invoiceModeFor } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { herinneringMist, type MistStuk } from "@/lib/onboarding/herinnering-teksten";
import { klusFeiten } from "@/lib/onboarding/klaar-voor-klus-server";
import { nogVoorEersteKlus, type KlusStuk } from "@/lib/onboarding/klaar-voor-klus";

// De feiten achter de herinnering aan een werker (12 nov 2026): wat mist er precies? De top-regels komen van de poort
// (werkerPoortStand), alleen het detail van "gegevens" (BSN, overeenkomst, btw/KOR, postcode) wordt hier erbij gehaald, met
// dezelfde regels als de poort (lib/onboarding/werker-poort-server.ts). Een storing in een bron telt als "niet te herinneren":
// liever geen mail dan een onware.

/** Stukken van "vóór de eerste klus" waar de werker zelf iets aan doet, met hun naam in de herinnering. */
const NA_AANMELDING = { bsn: "bsn", contract: "contract", bedrijf: "btw", iban: "iban", werkrecht: "werkrecht" } as const satisfies Partial<Record<KlusStuk, MistStuk>>;

/** Wat de werker nog moet doen voor zijn aanmelding en daarna vóór zijn eerste klus; leeg = klaar (of niets wat we kunnen noemen). */
export async function werkerMist(userId: string): Promise<MistStuk[]> {
  const stand = await werkerPoortStand(userId);
  // de aanmelding is af: wat reageren nog tegenhoudt (16 nov, eigenaar). Het ID nakijken en de KVK-controle doen wij zelf:
  // daar sturen we geen herinnering voor
  if (stand.klaar) return nogVoorEersteKlus(await klusFeiten(userId)).flatMap((s) => (Object.hasOwn(NA_AANMELDING, s) ? [NA_AANMELDING[s as keyof typeof NA_AANMELDING]] : []));
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
