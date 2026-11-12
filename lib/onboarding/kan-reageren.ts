import { prisma } from "@/lib/prisma";
import { payoutEligibility } from "@/lib/fiscal/eligibility";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";

// ---------------------------------------------------------------------------
// Kan deze werker nu echt op klussen reageren? Voor de mails "aanmelding compleet" en "ID
// geverifieerd": die zeggen "je kunt vanaf nu reageren" alleen als het waar is. Dezelfde regel als
// canApply in lib/dashboard/marketplace.ts (ID geverifieerd, eligibility, niet geblokkeerd), plus
// de poort van de werker-app (lib/onboarding/werker-poort.ts): zonder ingevulde start zie je de
// klussen niet. Bij een storing: "nee", zonder reden; een mail belooft dan liever te weinig.
// ---------------------------------------------------------------------------

export interface KanReageren {
  ok: boolean;
  /** wat er nog ontbreekt, in gewone taal (uit lib/fiscal/eligibility.ts); null = onbekend of niets */
  reden: string | null;
  /** sleutel van de reden voor de vertaling (lib/i18n/fouten.ts), als eligibility die gaf */
  sleutel?: string;
}

export async function kanReagerenOpKlussen(userId: string, now = new Date()): Promise<KanReageren> {
  try {
    const [user, profiel, poort, eligibility] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true } }),
      prisma.freelancerProfile.findUnique({ where: { userId }, select: { isBlacklisted: true, matchingBlockedUntil: true } }),
      werkerPoortStand(userId),
      payoutEligibility(userId),
    ]);
    if (!user || user.kycStatus !== "VERIFIED" || !profiel) return { ok: false, reden: null };
    if (!poort.klaar) return { ok: false, reden: null };
    if (!eligibility.ok) return { ok: false, reden: eligibility.reason, ...(eligibility.sleutel ? { sleutel: eligibility.sleutel } : {}) };
    if (profiel.isBlacklisted) return { ok: false, reden: null };
    if (profiel.matchingBlockedUntil && profiel.matchingBlockedUntil.getTime() > now.getTime()) return { ok: false, reden: null };
    return { ok: true, reden: null };
  } catch {
    return { ok: false, reden: null };
  }
}
