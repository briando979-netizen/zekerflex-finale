import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";

// ---------------------------------------------------------------------------
// Can this worker actually be paid for a klus? The rule differs by werkvorm:
//   • zzp / flexwerker → needs a way to invoice: valid KVK, a valid btw-nummer,
//     or the kleineondernemersregeling (KOR).
//   • uitzendkracht (invoiceMode "payroll") → no KVK; needs a BSN on file and a
//     rekeningnummer for the loonstrook payout.
// Identity (KYC) is checked separately by the caller.
// ---------------------------------------------------------------------------

export interface PayoutEligibility {
  ok: boolean;
  track: "invoice" | "payroll";
  /** null when ok; otherwise a message safe to show the freelancer */
  reason: string | null;
}

export async function payoutEligibility(userId: string): Promise<PayoutEligibility> {
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
      };
    }
    const contract = await activeUitzendContract(userId);
    return {
      ok: Boolean(contract),
      track,
      reason: contract
        ? null
        : "Onderteken eerst je uitzendovereenkomst bij Verificatie om op klussen te reageren.",
    };
  }

  const ok = Boolean(profile?.kvkValid || profile?.vatValid || fiscal.vatValid || fiscal.korApplies);
  return {
    ok,
    track,
    reason: ok
      ? null
      : "Je hebt nog geen geldig KVK-nummer of KOR. Maak er een aan om op deze klussen te reageren.",
  };
}
