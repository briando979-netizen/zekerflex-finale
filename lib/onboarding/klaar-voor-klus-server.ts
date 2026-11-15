import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { werkrechtVoorWerk } from "@/lib/werkrecht/store";
import { kvkWachtVan } from "@/lib/kvk/tegoed-opslag";
import { nogVoorEersteKlus, type KlusFeiten, type KlusStuk } from "@/lib/onboarding/klaar-voor-klus";

// De feiten voor "Nog nodig vóór je eerste klus" (lib/onboarding/klaar-voor-klus.ts), met dezelfde bronnen en regels als
// payoutEligibility (lib/fiscal/eligibility.ts) en de ID-eis van reageren (lib/matching/apply.ts).

export async function klusFeiten(userId: string): Promise<KlusFeiten> {
  const [fiscal, profiel, user, werkrecht] = await Promise.all([
    getFiscal(userId),
    prisma.freelancerProfile.findUnique({ where: { userId }, select: { kvkValid: true, vatValid: true, payoutIban: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true } }),
    werkrechtVoorWerk(userId, "NL").catch(() => ({ ok: true, reden: null })),
  ]);
  const payroll = invoiceModeFor(fiscal) === "payroll";
  const bedrijf = Boolean(profiel?.kvkValid || profiel?.vatValid || fiscal.vatValid || fiscal.korApplies);
  return {
    soort: fiscal.workerKind ?? null,
    payroll,
    idGoedgekeurd: user?.kycStatus === "VERIFIED",
    bsn: Boolean(fiscal.bsnHash),
    // alleen bij verloning nodig; een storing telt als "getekend" (dan zegt de controle bij reageren het wel)
    contract: payroll ? Boolean(await activeUitzendContract(userId).catch(() => true)) : true,
    bedrijf,
    kvkWacht: !payroll && !bedrijf && Boolean(await kvkWachtVan("werker", userId).catch(() => false)),
    iban: Boolean(fiscal.iban || profiel?.payoutIban),
    werkrechtOpen: !werkrecht.ok,
  };
}

/** Wat deze werker na de aanmelding nog nodig heeft om te reageren (leeg bij een storing: dan geen lijst). */
export async function nogVoorEersteKlusVan(userId: string): Promise<KlusStuk[]> {
  return nogVoorEersteKlus(await klusFeiten(userId));
}
