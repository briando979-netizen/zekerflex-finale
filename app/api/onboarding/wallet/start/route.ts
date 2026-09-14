import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { startWalletVerification } from "@/lib/kyc/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/onboarding/wallet/start — begin a digital-wallet identity check.
// Returns the request parameters the client passes straight into
// id-verifier's requestCredentials() (navigator.credentials.get()).
export async function POST(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const { attemptId, requestParams } = await startWalletVerification(principal.userId);
    return NextResponse.json({ attemptId, requestParams });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
