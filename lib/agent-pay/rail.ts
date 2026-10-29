import { env } from "@/lib/env";
import type { PaymentIntent } from "./intents";

export interface RailResult {
  executed: boolean;
  detail: string;
}

// Pluggable betaalrail. STANDAARD UIT: er wordt geen echt geld verplaatst totdat
// de eigenaar bewust een rail aansluit (AGENT_PAY_RAIL + credentials) en de
// aansprakelijkheid accepteert. Wordt door de approve-route ALLEEN aangeroepen
// voor een GOEDGEKEURDE betaling; de harde poort zit in executeIntent().
export async function runRail(intent: PaymentIntent): Promise<RailResult> {
  const rail = (env.AGENT_PAY_RAIL ?? "").trim().toLowerCase();
  if (!rail || rail === "off") {
    return { executed: false, detail: "Geen betaalrail aangesloten — goedgekeurd, maar handmatig uit te voeren." };
  }
  // Hier koppelt de eigenaar zijn eigen, vergunninghoudende rail (Stripe/SEPA).
  // Nog niet geïmplementeerd, dus bewust géén echt geld:
  void intent;
  return { executed: false, detail: `Rail "${rail}" is ingesteld maar nog niet geïmplementeerd — goedgekeurd, handmatig uit te voeren.` };
}
