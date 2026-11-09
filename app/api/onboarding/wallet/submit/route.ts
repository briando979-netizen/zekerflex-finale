import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { ibanBevestigingAntwoord } from "@/lib/fiscal/iban-bevestiging";
import { submitFreelancerOnboardingViaWallet } from "@/lib/onboarding/verify";
import { controleerThuisbasis, thuisbasisVelden } from "@/lib/onboarding/thuisbasis-schema";
import { geocodeThuisbasis } from "@/lib/geo/thuisbasis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  attemptId: z.string().min(1),
  kvkNumber: z.string().trim().max(20).optional(),
  ...thuisbasisVelden,
  houseNumber: z.string().trim().max(12).optional(),
  payoutIban: z.string().trim().min(15).max(34),
  /** Bevestigingscode bij een gewijzigd IBAN (mail of 2FA). */
  ibanCode: z.string().trim().max(32).optional(),
}).superRefine(controleerThuisbasis);

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

    // Een buitenlands adres dat OSM niet kent: stoppen vóór de wallet-uitslag wordt verbruikt.
    if (parsed.data.country && parsed.data.country !== "NL") {
      await geocodeThuisbasis({ land: parsed.data.country, postcode: parsed.data.postalCode, plaats: parsed.data.city });
    }
    const result = await submitFreelancerOnboardingViaWallet({
      userId: principal.userId,
      attemptId: parsed.data.attemptId,
      kvkNumber: parsed.data.kvkNumber ?? "",
      postalCode: parsed.data.postalCode,
      country: parsed.data.country,
      city: parsed.data.city,
      houseNumber: parsed.data.houseNumber,
      payoutIban: parsed.data.payoutIban,
      ibanCode: parsed.data.ibanCode,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    // Een gewijzigd IBAN zonder (geldige) bevestigingscode: 423 met eigen code, nooit 403.
    const ibanFout = ibanBevestigingAntwoord(err);
    if (ibanFout) return NextResponse.json(ibanFout.body, { status: ibanFout.status });
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
