import { env } from "@/lib/env";
import { accountStand, betalenUit } from "@/lib/billing/stripe-betalen";

// De server-kant van betalen per overschrijving (lib/billing/overschrijving.ts): waar de rekening van ZekerFlex vandaan komt en of Stripe
// op dit moment betaalt. Geen IBAN in een log.

/** De rekening van ZekerFlex uit de bestaande instelling (de eigenaar-taak "sepa"): null als die niet is ingevuld. */
export function platformBankgegevens(): { iban: string | null; naam: string | null } {
  return { iban: env.SEPA_CREDITOR_IBAN?.trim() || null, naam: env.SEPA_CREDITOR_NAME?.trim() || null };
}

/**
 * Staat betalen via Stripe dicht? Ja als de vlag stripe:betalen-uit geldt of de laatst gemeten stand zegt dat het account geen
 * betalingen ontvangt. Kan de stand niet gelezen worden, dan geldt "niet dicht": de checkout zelf geeft dan een nette 423.
 */
export async function stripeBetalenDicht(): Promise<boolean> {
  const [vlag, stand] = await Promise.all([betalenUit().catch(() => null), accountStand().catch(() => null)]);
  return Boolean(vlag) || stand?.betalen === false;
}