import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { werkrechtVoorWerk } from "@/lib/werkrecht/store";
import { kvkWachtVan } from "@/lib/kvk/tegoed-opslag";

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
    // sinds 13 nov hoort de KVK niet meer bij de aanmelding: hier pas. Wacht de controle (tegoed bij KVKBase op of de
    // minuutlimiet; lib/kvk/herkansing.ts probeert het opnieuw), zeg dat dan eerlijk in plaats van "nog geen KVK-nummer"
    if (await kvkWachtVan("werker", userId)) {
      return { ok, track, reason: "We konden je KVK-nummer nog niet controleren bij de KVK. We proberen het vanzelf opnieuw; daarna kun je op deze klussen reageren.", sleutel: "elig.kvkWacht" };
    }
    return { ok, track, reason: "Voor deze klussen is een geldig KVK-nummer, btw-nummer of de KOR nodig. Vul het in bij Verificatie of Fiscale gegevens om te reageren.", sleutel: "elig.kvk" };
  }
  // Het IBAN zit sinds 10 nov niet meer in de onboarding: zonder rekeningnummer kunnen we niet uitbetalen
  if (!(profile?.payoutIban || fiscal.iban)) {
    return { ok: false, track, reason: "Vul je rekeningnummer (IBAN) in bij Verificatie → Bankrekening bevestigen om op klussen te reageren.", sleutel: "elig.iban" };
  }
  return { ok: true, track, reason: null };
}
