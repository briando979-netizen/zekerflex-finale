// ---------------------------------------------------------------------------
// Eigenaar-taken (13 nov 2026): betalen via het Stripe-account van Zekerflex, Inc. De wissel zelf staat in Beheer →
// Risico & systeem → Stripe-account (lib/billing/stripe-account.ts). De eerste taak vinkt zichzelf af zodra daar een
// account actief is (KV stripe:actief-account); de tweede verschijnt alleen als de Connect-webhook niet lukte (Connect
// staat dan niet aan op het account). Puur: alleen de stand, nooit een sleutel.
// ---------------------------------------------------------------------------

import type { OwnerTodo } from "@/lib/admin/owner-todos";
import type { StripeAccountInfo } from "@/lib/billing/stripe-account-vorm";

/** De taken bij de stand uit Beheer; `undefined` = niet kunnen lezen (dan geen taak, om niets vals te tonen). */
export function stripeAccountTodos(actief: StripeAccountInfo | null | undefined): OwnerTodo[] {
  if (actief === undefined) return [];
  const sleutel: OwnerTodo = {
    id: "stripe-account-inc",
    group: "Geld & bank",
    title: actief ? `Stripe-account actief: ${actief.naam ?? actief.accountId}` : "Betalen via Zekerflex, Inc.: plak de Stripe-sleutel in Beheer",
    why: "Het oude Stripe-account (op naam van een stichting) staat sinds 11 november dicht. Betalingen gaan voortaan via het Stripe-account van Zekerflex, Inc. Zolang dat niet gekozen is, ontvangt ZekerFlex geen betalingen via Stripe.",
    how: [
      "Log in bij Stripe en kies rechtsboven het account Zekerflex, Inc. Kijk of het volledig actief is: betalingen en uitbetalingen staan aan, je paspoort is gecontroleerd.",
      "Ga naar Ontwikkelaars → API-sleutels en kopieer de geheime sleutel (begint met sk_live_). Plak hem nergens anders dan in de volgende stap: niet in een chat of mail.",
      "Ga in ZekerFlex naar Beheer → Risico & systeem → Stripe-account, plak de sleutel en druk op 'Controleer'.",
      "Kijk de naam na (Zekerflex, Inc.) en dat 'Betalingen ontvangen' op ja staat. Druk dan op 'Gebruik dit account' en bevestig.",
      "Deze taak vinkt zichzelf af zodra het account actief is.",
    ],
    auto: true,
    eerst: { reden: "geld binnen" },
    done: actief !== null,
    ...(actief ? { doneNote: `sinds ${new Date(actief.ingesteldOp).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" })}, sleutel eindigt op ${actief.eind}` } : {}),
  };
  if (!actief || actief.connectWebhook) return [sleutel];
  const connect: OwnerTodo = {
    id: "stripe-connect-aanzetten",
    group: "Geld & bank",
    title: "Stripe Connect aanzetten op het account van Zekerflex, Inc.",
    why: "Werkers kunnen hun bankrekening via Stripe koppelen (Stripe Connect). Daarvoor moet Connect aan staan op het nieuwe account; anders kon ZekerFlex de Connect-webhook niet aanmaken. Betalingen werken wel gewoon.",
    how: [
      "Open in Stripe (account Zekerflex, Inc.) het onderdeel Connect en rond 'Aan de slag' af.",
      "Ga daarna naar Beheer → Risico & systeem → Stripe-account, plak de sleutel opnieuw en druk op 'Gebruik dit account': dan maakt ZekerFlex de Connect-webhook alsnog aan.",
      "Deze taak verdwijnt zodra de Connect-webhook er is.",
    ],
    auto: true,
    done: false,
  };
  return [sleutel, connect];
}
