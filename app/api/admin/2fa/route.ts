import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { adminResetTwoFactor } from "@/lib/auth/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.string().min(5).max(64) });

// POST /api/admin/2fa — reset someone's two-step verification (lost phone + recovery codes). Audited.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  const { userId } = schema.parse(await req.json().catch(() => ({})));
  if (userId === principal.userId) throw AppError.forbidden("Je eigen tweestapsverificatie zet je uit via je eigen instellingen (met een code).");
  await adminResetTwoFactor(userId, principal.userId);
  return NextResponse.json({ ok: true });
});
