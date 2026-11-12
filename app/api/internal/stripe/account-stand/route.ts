import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { meetStripeAccount } from "@/lib/billing/stripe-betalen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (elke 15 min, deploy/cron/entrypoint.sh): staat het live Stripe-account nog open voor betalingen en uitbetalingen?
// Slaat het om naar uit, dan krijgt de eigenaar meteen een melding en valt de bankcontrole terug op het bankafschrift
// (lib/billing/stripe-betalen.ts). Ook als de webhook niet doorkomt. Eén aanroep naar Stripe (GET /v1/account).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  if (!env.STRIPE_SECRET_KEY) {
    void recordCronHeartbeat("stripe-account-stand", true);
    return NextResponse.json({ overgeslagen: "geen Stripe-sleutel" });
  }
  try {
    const stand = await meetStripeAccount();
    void recordCronHeartbeat("stripe-account-stand", true);
    return NextResponse.json({ betalen: stand?.betalen ?? null, uitbetalen: stand?.uitbetalen ?? null });
  } catch (err) {
    void recordCronHeartbeat("stripe-account-stand", false);
    logger.warn("stripe account-stand meten mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Stripe niet bereikbaar" } }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
