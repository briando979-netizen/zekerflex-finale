import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { getRequest } from "@/lib/bank/p2p";
import { createBankRequestSession } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/betaal/verzoek/:id — public: pay a ZekerFlex Bank betaalverzoek
// with iDEAL/card, no account needed. Holding the link is the authorisation,
// like a Tikkie; the webhook credits the requester once Stripe confirms.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "bank-request-ideal", identifier: clientIp(request), limit: 10, windowSeconds: 600, message: "Te veel pogingen — probeer het over enkele minuten opnieuw." });
    const { id } = await params;
    const r = await getRequest(id);
    if (!r) throw AppError.notFound("Betaalverzoek niet gevonden");
    if (r.status !== "open") throw AppError.precondition(r.status === "paid" ? "Dit verzoek is al betaald" : "Dit verzoek is verlopen of ingetrokken");
    const session = await createBankRequestSession({ requestId: r.id, bankAccountId: r.accountId, holderName: r.holderName, amountCents: r.amountCents, description: r.description });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
