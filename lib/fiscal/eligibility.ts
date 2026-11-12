import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { werkrechtVoorWerk } from "@/lib/werkrecht/store";

// ---------------------------------------------------------------------------
// Can this worker actually be paid for a klus? The rule differs by werkvorm:
//   • zzp / flexwerker → needs a way to invoice: valid KVK, a valid btw-nummer,
//     or the kleineondernemersregeling (KOR).
//   • uitzendkracht (invoiceMode "payroll") → no KVK; needs a BSN on file and a
//     rekeningnummer for the loonstrook payout.
// Identity (KYC) is checked separately by the caller. Daarna, op beide sporen:
// het recht om in Nederland te werken (verklaring + bewijs, lib/werkrecht).
// Alle diensten zijn nu in Nederland (Branch heeft geen land).
// ---------------------------------------------------------------------------

export interface PayoutEligibility {
  ok: boolean;
  track: "invoice" | "payroll";
  /** null when ok; otherwise a message safe to show the freelancer */
  reason: string | null;
  /** sleutel van de melding voor de vertaling in de werker-app (lib/i18n/fouten.ts); alleen bij sommige redenen */
  sleutel?: string;
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

  if (track === "payroll") {
    const hasBasics = Boolean(fiscal.bsnHash) && Boolean(fiscal.iban || profile?.payoutIban);
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

  const ok = Boolean(profile?.kvkValid || profile?.vatValid || fiscal.vatValid || fiscal.korApplies);
  if (!ok) {
    return { ok, track, reason: "Je hebt nog geen geldig KVK-nummer of KOR. Maak er een aan om op deze klussen te reageren.", sleutel: "elig.kvk" };
  }
  // Het IBAN zit sinds 10 nov niet meer in de onboarding: zonder rekeningnummer kunnen we niet uitbetalen
  if (!(profile?.payoutIban || fiscal.iban)) {
    return { ok: false, track, reason: "Vul je rekeningnummer (IBAN) in bij Verificatie → Bankrekening bevestigen om op klussen te reageren.", sleutel: "elig.iban" };
  }
  return { ok: true, track, reason: null };
}
