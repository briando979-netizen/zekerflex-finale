import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { completeWalletVerification } from "@/lib/kyc/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  attemptId: z.string().min(1),
  credentials: z.object({
    id: z.string(),
    type: z.string(),
    data: z.unknown(),
    protocol: z.string(),
    timestamp: z.string(),
  }),
});

// POST /api/onboarding/wallet/verify — cryptographically verify the raw
// response id-verifier's requestCredentials() returned in the browser.
// Does not persist anything yet; see /api/onboarding/wallet/submit.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige aanvraag");

    const outcome = await completeWalletVerification({
      userId: principal.userId,
      attemptId: parsed.data.attemptId,
      credentials: parsed.data.credentials,
      origin: new URL(request.url).origin,
      accountFullName: principal.fullName,
    });
    return NextResponse.json(outcome);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
