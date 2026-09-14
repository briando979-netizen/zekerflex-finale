import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { submitFreelancerOnboardingViaWallet } from "@/lib/onboarding/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  attemptId: z.string().min(1),
  kvkNumber: z.string().trim().max(20).optional(),
  postalCode: z.string().trim().regex(/^\s*\d{4}\s*[A-Za-z]{2}\s*$/, "Gebruik een geldige postcode, bijv. 1012 AB"),
  houseNumber: z.string().trim().min(1).max(12),
  payoutIban: z.string().trim().min(15).max(34),
});

// POST /api/onboarding/wallet/submit — final step of the digital-wallet
// onboarding path: the identity itself was already verified in
// /api/onboarding/wallet/verify; this saves the home base + IBAN (+ KVK)
// and persists the verification, same as the photo-capture flow does.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw AppError.validation(
        parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens",
        parsed.error.flatten(),
      );
    }

    const result = await submitFreelancerOnboardingViaWallet({
      userId: principal.userId,
      attemptId: parsed.data.attemptId,
      kvkNumber: parsed.data.kvkNumber ?? "",
      postalCode: parsed.data.postalCode,
      houseNumber: parsed.data.houseNumber,
      payoutIban: parsed.data.payoutIban,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
