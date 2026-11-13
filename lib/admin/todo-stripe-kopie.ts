// ---------------------------------------------------------------------------
// Eigenaar-taak (14 nov 2026): de ID-foto's en gegevens uit het OUDE Stripe-account (de stichting) naar ZekerFlex kopiëren
// (lib/kyc/stripe-kopie.ts). Daarvoor een beperkte sleutel van dat account, met een IP-beperking op de server: zonder die
// beperking geeft Stripe alleen controles van de laatste 48 uur vrij. Puur: alleen aantallen.
// ---------------------------------------------------------------------------

import type { OwnerTodo } from "@/lib/admin/owner-todos";

export const SERVER_IP = "37.97.226.24";

/** De taak, of null zonder Stripe-controles (of als er niet geteld kon worden). Afgevinkt als alles gekopieerd is. */
export function stripeKopieTodo(stand: { totaal: number; af: number } | null): OwnerTodo | null {
  if (!stand || stand.totaal === 0) return null;
  const klaar = stand.af >= stand.totaal;
  return {
    id: "stripe-kopie",
    group: "Beheer & veiligheid",
    title: klaar
      ? `ID-foto's en gegevens uit het oude Stripe-account gekopieerd (${stand.af} van ${stand.totaal})`
      : `ID-foto's en gegevens uit het oude Stripe-account naar ZekerFlex halen (${stand.af} van ${stand.totaal} gekopieerd)`,
    why: "De ID-controles van vóór de overstap staan bij Stripe, in het oude account van de stichting. Met een kopie staan de voorkant, de achterkant, de selfie en de gegevens van het document gewoon bij de gebruiker in Beheer, net als bij de eigen ID-scan, en gelden dezelfde bewaarregels. Een BSN of persoonsnummer nemen we nooit over.",
    how: [
      "Log in op het OUDE Stripe-account (de stichting), live-modus. Ga naar Ontwikkelaars → API-sleutels → Beperkte sleutel maken.",
      "Zet de rechten: Identity Verification Results: Lezen, All Detailed Verification Results: Lezen, Files: Schrijven. Al het andere uit.",
      `Zet bij de sleutel de IP-beperking op ${SERVER_IP} (de server). Zonder die beperking geeft Stripe alleen controles van de laatste 48 uur vrij.`,
      "Open in Beheer een gebruiker met een Stripe-controle, plak de sleutel bij Identiteitscontroles en druk op \"Kopieer alles uit Stripe\".",
      "Deze taak vinkt zichzelf af zodra alle Stripe-controles gekopieerd zijn (een foto die Stripe niet meer heeft, telt met een reden).",
    ],
    auto: true,
    done: klaar,
  };
}
