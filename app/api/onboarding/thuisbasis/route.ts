import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { geocodeThuisbasis } from "@/lib/geo/thuisbasis";
import { controleerThuisbasis, thuisbasisVelden } from "@/lib/onboarding/thuisbasis-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object(thuisbasisVelden).superRefine(controleerThuisbasis);

// POST /api/onboarding/thuisbasis { country, postalCode, city }
// Controleert een thuisbasis in het buitenland vóór de ID-scan opent
// (components/app/OnboardingForm.tsx): een adres dat OpenStreetMap niet kent,
// kwam anders pas ná de scan aan het licht, met het formulier onder de scan.
// Schrijft niets; de uitslag blijft een uur bewaard (lib/geo/thuisbasis.ts).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    await enforceRateLimit({
      name: "onboarding-thuisbasis",
      identifier: principal.userId,
      limit: 20,
      windowSeconds: 3600,
      message: "Je hebt vaak een adres gecontroleerd. Probeer het over een uur opnieuw.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens");
    const geo = await geocodeThuisbasis({
      land: parsed.data.country || "NL",
      postcode: parsed.data.postalCode,
      plaats: parsed.data.city,
    });
    return NextResponse.json({ ok: true, plaats: geo.city });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
