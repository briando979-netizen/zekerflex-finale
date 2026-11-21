import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { adminResetTwoFactor } from "@/lib/auth/two-factor";
import { TWEESTAP_AAN } from "@/lib/auth/tweestap-aan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.string().min(5).max(64) });

// POST /api/admin/2fa — reset someone's two-step verification (lost phone + recovery codes). Audited.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  // uit sinds 21 nov 2026 (eigenaar): er is niets meer te resetten
  if (!TWEESTAP_AAN) throw AppError.notFound("Tweestapsverificatie bestaat niet meer op ZekerFlex.");
  const { userId } = schema.parse(await req.json().catch(() => ({})));
  if (userId === principal.userId) throw AppError.forbidden("Je eigen tweestapsverificatie zet je uit via je eigen instellingen (met een code).");
  await adminResetTwoFactor(userId, principal.userId);
  return NextResponse.json({ ok: true });
});
