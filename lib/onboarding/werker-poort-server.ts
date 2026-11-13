import { prisma } from "@/lib/prisma";
import { getFiscal } from "@/lib/fiscal/store";
import { getBrancheKeuze } from "@/lib/worker/branche-store";
import { werkrechtOverzicht } from "@/lib/werkrecht/store";
import { branchesTellen, werkerOnboardingKlaar, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";
import { hasTwoFactor } from "@/lib/auth/two-factor";
import { getUserProfileExtra } from "@/lib/profile/store";
import type { BrancheKeuze } from "@/lib/shifts/branche-keuze";
import { AppError } from "@/lib/errors";
import { isReservedTestAddress } from "@/lib/mail/test-adres";

// De feiten voor de poort van de werker-app (lib/onboarding/werker-poort.ts), in één keer
// voor de layout van /dashboard. Een storing in een bron mag de app niet dichtgooien: die
// stap telt dan als ingevuld (de controles vóór werk staan los hiervan, lib/fiscal/eligibility.ts).

export interface WerkerPoortStand extends WerkerPoortFeiten {
  klaar: boolean;
  workerKind: "zzp" | "flexwerker" | "uitzendkracht" | null;
  brancheKeuze: BrancheKeuze | null;
}

export async function werkerPoortStand(userId: string): Promise<WerkerPoortStand> {
  const [fiscal, profiel, user, inBehandeling, brancheKeuze, werkrecht, tweestap, passkeys, extra] = await Promise.all([
    getFiscal(userId),
    prisma.freelancerProfile.findUnique({ where: { userId }, select: { homePostalCode: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true, createdAt: true } }),
    // ingestuurd en in behandeling: niet een Stripe-sessie die alleen geopend is (die zet al PENDING)
    prisma.identityVerification.findFirst({
      where: { userId, status: "PENDING", OR: [{ provider: { not: "STRIPE_IDENTITY" } }, { decisionStatus: "processing" }] },
      select: { id: true },
    }),
    getBrancheKeuze(userId).catch(() => ({ alle: true, branches: [] }) as BrancheKeuze),
    werkrechtOverzicht(userId).catch(() => null),
    // een storing telt als "aan": de poort mag de app niet dichtgooien
    hasTwoFactor(userId).catch(() => true),
    prisma.passkey.count({ where: { userId } }).catch(() => 0),
    // een storing telt als "foto gezet": de poort mag de app niet dichtgooien
    getUserProfileExtra(userId).catch(() => null),
  ]);
  const feiten: WerkerPoortFeiten = {
    soortGekozen: Boolean(fiscal.workerKind),
    // een account van vóór de stap (10 nov) zonder keuze telt als "alle branches" (werker-poort.ts, BRANCHE_STAP_SINDS)
    branchesGekozen: branchesTellen(brancheKeuze !== null, user?.createdAt),
    gegevensIngevuld:
      // de soort en de postcode van de thuisbasis. Sinds 13 nov niet meer hier, net als het IBAN op 10 nov: KVK/btw/KOR van
      // een zzp'er of flexwerker (86) en het BSN en de uitzendovereenkomst van een uitzendkracht (eigenaar; meting 13 nov:
      // 11 van de 16 uitzendkrachten bleven op het BSN hangen). Die komen vóór de eerste klus: reageren houdt ze tegen
      // (lib/fiscal/eligibility.ts, elig.uitzendGegevens en elig.contract), de loonadministratie krijgt ze dus altijd
      Boolean(fiscal.workerKind) && Boolean(profiel?.homePostalCode),
    identiteitIngestuurd: user?.kycStatus === "VERIFIED" || (user?.kycStatus === "PENDING" && Boolean(inBehandeling)),
    // Nederland staat altijd vooraan (lib/werkrecht/store.ts); een storing telt niet als "niet ingevuld"
    werkrechtIngevuld: werkrecht === null || werkrecht[0]?.stand === "ok" || werkrecht[0]?.stand === "wacht",
    // tweestapsverificatie met een app, of een passkey (vingerafdruk/gezicht): allebei tweestaps
    tweestapAan: tweestap || passkeys > 0,
    fotoGezet: extra === null || Boolean(extra.avatarUploadId),
  };
  return {
    ...feiten,
    klaar: werkerOnboardingKlaar(feiten),
    workerKind: fiscal.workerKind ?? null,
    brancheKeuze,
  };
}

/** De reden die de werker ziet; ook in page.block (lib/i18n/freelancer.ts), zodat hij in zijn app-taal staat. */
export const ONBOARDING_EERST = "Rond eerst je aanmelding af om op klussen te reageren. Bovenaan deze pagina zie je wat er nog mist.";

/**
 * Mag deze werker, wat de onboarding betreft, op klussen reageren (12 nov, eigenaar: de app is open, alleen reageren
 * wacht op de onboarding)? Testaccounts (.test/.example, de beoordelaars van Apple en Google) en een storing: ja. De
 * echte controles vóór werk (ID geverifieerd, eligibility, werkrecht) staan daar los van en blijven gelden.
 */
export async function onboardingKlaarVoorReageren(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user || isReservedTestAddress(user.email ?? "")) return true;
    return (await werkerPoortStand(userId)).klaar;
  } catch {
    return true;
  }
}

/** Gooit 412 met ONBOARDING_EERST als de onboarding nog niet af is (geen 403: CrowdSec). */
export async function eisOnboardingVoorReageren(userId: string): Promise<void> {
  if (!(await onboardingKlaarVoorReageren(userId))) throw AppError.precondition(ONBOARDING_EERST).metSleutel("onboarding.eerst");
}
