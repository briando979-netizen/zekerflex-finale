import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { werkrechtVoorWerk } from "@/lib/werkrecht/store";
import { kvkWachtVan } from "@/lib/kvk/tegoed-opslag";
import { proefklusRuimte } from "@/lib/fiscal/proefklussen";
import { AppError } from "@/lib/errors";
import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";

/** De reden voor een uitzendkracht op een klus die niet van een aangesloten uitzendbureau is (lib/uitzend/model.ts). */
export const UITZEND_ALLEEN_VIA_BUREAU =
  "Als uitzendkracht reageer je op uitzendklussen van aangesloten uitzendbureaus. Voor andere klussen heb je een KVK-nummer nodig: kies dan zzp'er of flexwerker bij Werkvorm.";

// ---------------------------------------------------------------------------
// Can this worker actually be paid for a klus? The rule differs by werkvorm:
//   • zzp / flexwerker → needs a way to invoice: valid KVK, a valid btw-nummer,
//     or the kleineondernemersregeling (KOR).
//   • uitzendkracht (invoiceMode "payroll") → no KVK; needs a BSN on file and a
//     rekeningnummer for the loonstrook payout.
// Identity (KYC) is checked separately by the caller. Daarna, op beide sporen:
// het recht om in Nederland te werken (verklaring + bewijs, lib/werkrecht).
// Alle diensten zijn nu in Nederland (Branch heeft geen land).
//
// Proefklussen (21 nov 2026, eigenaar; lib/fiscal/proefklussen-kern.ts): een zzp'er of flexwerker mag zijn eerste 2 klussen
// aannemen zonder KVK/btw/KOR en zonder rekeningnummer; vanaf de derde geldt de regel hierboven weer. Alleen hier (zelf
// reageren en een geaccepteerd tegenbod). Uitbetalen blijft wachten op de gegevens (lib/timesheets/approve.ts), en de
// matching (pushaanbod, automatisch inplannen, spoed, geo) blijft KVK én btw eisen (lib/matching/geschikt.ts).
// ---------------------------------------------------------------------------

export interface PayoutEligibility {
  ok: boolean;
  track: "invoice" | "payroll";
  /** null when ok; otherwise a message safe to show the freelancer */
  reason: string | null;
  /** sleutel van de melding voor de vertaling in de werker-app (lib/i18n/fouten.ts); alleen bij sommige redenen */
  sleutel?: string;
  /** alleen als reageren mag dankzij een proefklus (KVK/btw/KOR of het rekeningnummer ontbreekt nog): hoeveel er nog over zijn */
  proef?: { over: number };
}

export async function payoutEligibility(userId: string): Promise<PayoutEligibility> {
  const fiscaal = await fiscalEligibility(userId);
  if (!fiscaal.ok) return fiscaal;
  const werkrecht = await werkrechtVoorWerk(userId, "NL");
  return werkrecht.ok ? fiscaal : { ok: false, track: fiscaal.track, reason: werkrecht.reden };
}

async function fiscalEligibility(userId: string): Promise<PayoutEligibility> {
  const [fiscal, profile] = await Promise.all([
    getFiscal(userId),
    prisma.freelancerProfile.findUnique({
      where: { userId },
      select: { kvkValid: true, vatValid: true, payoutIban: true },
    }),
  ]);

  const track: PayoutEligibility["track"] = invoiceModeFor(fiscal) === "payroll" ? "payroll" : "invoice";

  if (track === "payroll") return payrollEligibility(userId, fiscal, profile?.payoutIban ?? null);

  const bedrijfOk = Boolean(profile?.kvkValid || profile?.vatValid || fiscal.vatValid || fiscal.korApplies);
  // Het IBAN zit sinds 10 nov niet meer in de onboarding: zonder rekeningnummer kunnen we niet uitbetalen
  const ibanOk = Boolean(profile?.payoutIban || fiscal.iban);
  if (bedrijfOk && ibanOk) return { ok: true, track, reason: null };

  // Er ontbreekt iets. De eerste 2 klussen mogen toch (proefklussen); de telling alleen hier, dus niet voor wie alles al
  // heeft. Een storing in de telling geeft geen ruimte: dan geldt de gewone regel met de gewone melding.
  const ruimte = await proefklusRuimte(userId);
  if (ruimte.over > 0) return { ok: true, track, reason: null, proef: { over: ruimte.over } };

  if (!bedrijfOk) {
    // sinds 13 nov hoort de KVK niet meer bij de aanmelding: hier pas. Wacht de controle (tegoed bij KVKBase op of de
    // minuutlimiet; lib/kvk/herkansing.ts probeert het opnieuw), zeg dat dan eerlijk in plaats van "nog geen KVK-nummer"
    if (await kvkWachtVan("werker", userId)) {
      return { ok: false, track, reason: "We konden je KVK-nummer nog niet controleren bij de KVK. We proberen het vanzelf opnieuw; daarna kun je op deze klussen reageren.", sleutel: "elig.kvkWacht" };
    }
    // de proefklussen zijn op (echt geteld, geen storing): zeg dat erbij, anders begrijpt de werker niet waarom het nu niet meer mag
    if (ruimte.aangenomen !== null) {
      return { ok: false, track, reason: "Je hebt je eerste 2 klussen aangenomen. Voor de volgende is een geldig KVK- of btw-nummer (of de KOR) en je rekeningnummer nodig. Vul ze in bij Verificatie.", sleutel: "elig.proefOp" };
    }
    return { ok: false, track, reason: "Voor deze klussen is een geldig KVK-nummer, btw-nummer of de KOR nodig. Vul het in bij Verificatie of Fiscale gegevens om te reageren.", sleutel: "elig.kvk" };
  }
  return { ok: false, track, reason: "Vul je rekeningnummer (IBAN) in bij Verificatie → Bankrekening bevestigen om op klussen te reageren.", sleutel: "elig.iban" };
}

/** Het loonspoor (uitzendkracht): BSN, rekeningnummer en een getekende, geldende uitzendovereenkomst. Geen proefklussen. */
async function payrollEligibility(
  userId: string,
  fiscal: Awaited<ReturnType<typeof getFiscal>>,
  profielIban: string | null,
): Promise<PayoutEligibility> {
  const track = "payroll" as const;
  // ZekerFlex is sinds 21 nov zelf geen uitzender meer (lib/uitzend/model.ts): een uitzendkracht werkt alleen via een
  // aangesloten uitzendbureau. Op die klussen slaan de callers deze controle over (lib/uitzend/partners.ts); op alle
  // andere klussen kan ZekerFlex hem niet in dienst nemen, dus nee, met een eerlijke uitleg.
  if (!ZEKERFLEX_UITZENDER) {
    return { ok: false, track, reason: UITZEND_ALLEEN_VIA_BUREAU, sleutel: "elig.uitzendPartner" };
  }
  const hasBasics = Boolean(fiscal.bsnHash) && Boolean(fiscal.iban || profielIban);
  if (!hasBasics) {
    return {
      ok: false,
      track,
      reason: "Rond je uitzend-gegevens af (BSN en rekeningnummer) om op klussen te reageren.",
      sleutel: "elig.uitzendGegevens",
    };
  }
  const contract = await activeUitzendContract(userId);
  return {
    ok: Boolean(contract),
    track,
    reason: contract
      ? null
      : "Onderteken eerst je uitzendovereenkomst bij Verificatie om op klussen te reageren.",
    ...(contract ? {} : { sleutel: "elig.contract" }),
  };
}

/**
 * Dezelfde controle van het loonspoor voor de twee paden die niet langs payoutEligibility lopen: een pushaanbod aannemen
 * (app/api/shifts/[shiftId]/offer) en automatisch inplannen (lib/matching/engine.ts). Zonder BSN, rekeningnummer of
 * getekende uitzendovereenkomst kon een uitzendkracht daar toch ingepland worden, terwijl zelf reageren het wél tegenhield.
 * Gooit 412 met dezelfde reden en sleutel; voor het factuurspoor doet dit niets (daar beslist de matching, lib/matching/geschikt.ts).
 */
export async function eisUitzendGegevens(userId: string): Promise<void> {
  const fiscal = await getFiscal(userId);
  if (invoiceModeFor(fiscal) !== "payroll") return;
  const profiel = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { payoutIban: true } });
  const uit = await payrollEligibility(userId, fiscal, profiel?.payoutIban ?? null);
  if (uit.ok) return;
  const fout = AppError.precondition(uit.reason ?? "Je kunt nog geen diensten aannemen.");
  throw uit.sleutel ? fout.metSleutel(uit.sleutel) : fout;
}
