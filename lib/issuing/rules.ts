import { getCardRules } from "@/lib/issuing/settings";
import { spentToday, spentThisWeek } from "@/lib/issuing/spend";

// ---------------------------------------------------------------------------
// Beslissen of een kaartautorisatie wordt goedgekeurd of geweigerd, op basis
// van de regels: transactielimiet, dag-/weekbudget, categorie (MCC), land, en
// een optionele AI-risicocheck (hook).
// ---------------------------------------------------------------------------

export interface AuthInput {
  cardId: string;
  amountCents: number;
  mcc: string | null;
  merchantCountry: string | null;
}
export interface AuthDecision {
  approve: boolean;
  reason: string;
}

export async function evaluateAuthorization(input: AuthInput): Promise<AuthDecision> {
  const rules = await getCardRules(input.cardId);

  if (input.amountCents > rules.perTxLimitCents) {
    return { approve: false, reason: `boven transactielimiet (€ ${(rules.perTxLimitCents / 100).toFixed(0)})` };
  }
  if (input.mcc && rules.blockedMccs.includes(input.mcc)) {
    return { approve: false, reason: `geblokkeerde categorie (MCC ${input.mcc})` };
  }
  if (rules.allowedCountries.length > 0 && input.merchantCountry && !rules.allowedCountries.includes(input.merchantCountry)) {
    return { approve: false, reason: `land niet toegestaan (${input.merchantCountry})` };
  }

  const [day, week] = await Promise.all([spentToday(input.cardId), spentThisWeek(input.cardId)]);
  if (day + input.amountCents > rules.dailyBudgetCents) {
    return { approve: false, reason: "dagbudget overschreden" };
  }
  if (week + input.amountCents > rules.weeklyBudgetCents) {
    return { approve: false, reason: "weekbudget overschreden" };
  }

  if (rules.aiCheck) {
    // Hook voor een AI-risicocheck. Zolang er geen AI-node draait keuren we goed
    // (fail-open) — de harde regels hierboven blijven de vangrail.
  }

  return { approve: true, reason: "ok" };
}
