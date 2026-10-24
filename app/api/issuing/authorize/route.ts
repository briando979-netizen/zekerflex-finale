import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStripeClient } from "@/lib/billing/stripe";
import { logger } from "@/lib/logger";
import { evaluateAuthorization, type AuthDecision } from "@/lib/issuing/rules";
import { addSpend } from "@/lib/issuing/spend";
import { logAuthorization } from "@/lib/issuing/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Stripe Issuing real-time autorisatie-webhook. Stripe roept dit aan bij elke
// kaartbetaling; wij keuren synchroon goed of af op basis van de regels
// (transactielimiet, dag-/weekbudget, categorie, land, AI-hook) en loggen de
// beslissing. Stel in Stripe → Issuing → Autorisatie-webhooks dit endpoint in
// en zet STRIPE_ISSUING_WEBHOOK_SECRET (valt terug op STRIPE_WEBHOOK_SECRET).
// ---------------------------------------------------------------------------

interface IssuingAuth {
  id: string;
  card: string | { id: string };
  amount?: number;
  pending_request?: { amount?: number } | null;
  merchant_data?: { category_code?: string | null; country?: string | null; name?: string | null } | null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = env.STRIPE_ISSUING_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET;
  if (!env.STRIPE_SECRET_KEY || !secret) {
    return NextResponse.json({ error: { code: "UNCONFIGURED", message: "Issuing is nog niet geconfigureerd." } }, { status: 412 });
  }

  const stripe = getStripeClient();
  const sig = request.headers.get("stripe-signature");
  const raw = await request.text();

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(raw, sig ?? "", secret);
  } catch (err) {
    logger.warn("issuing webhook signature invalid", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "BAD_SIGNATURE", message: "Ongeldige handtekening" } }, { status: 400 });
  }

  if (event.type !== "issuing_authorization.request") {
    return NextResponse.json({ received: true });
  }

  const auth = event.data.object as unknown as IssuingAuth;
  const cardId = typeof auth.card === "string" ? auth.card : auth.card?.id ?? "unknown";
  const amountCents = Math.abs(auth.pending_request?.amount ?? auth.amount ?? 0);
  const mcc = auth.merchant_data?.category_code ?? null;
  const country = auth.merchant_data?.country ?? null;
  const merchant = auth.merchant_data?.name ?? null;

  let decision: AuthDecision;
  try {
    decision = await evaluateAuthorization({ cardId, amountCents, mcc, merchantCountry: country });
  } catch (err) {
    logger.error("issuing evaluate failed", { error: (err as Error).message });
    decision = { approve: false, reason: "interne fout — veilig geweigerd" };
  }

  try {
    if (decision.approve) {
      await stripe.issuing.authorizations.approve(auth.id);
      await addSpend(cardId, amountCents).catch(() => undefined);
    } else {
      await stripe.issuing.authorizations.decline(auth.id, { metadata: { reason: decision.reason.slice(0, 40) } });
    }
  } catch (err) {
    logger.error("issuing approve/decline failed", { authId: auth.id, error: (err as Error).message });
  }

  await logAuthorization({ id: auth.id, cardId, amountCents, merchant, mcc, country, approved: decision.approve, reason: decision.reason }).catch(() => undefined);

  return NextResponse.json({ received: true, approved: decision.approve });
}
