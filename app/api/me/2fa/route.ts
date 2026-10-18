import { NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  regenerateRecoveryCodes,
  twoFactorStatus,
} from "@/lib/auth/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/2fa — is two-step verification on for me?
export const GET = withAuth(async (_req, { principal }) => NextResponse.json(await twoFactorStatus(principal.userId)));

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("confirm"), code: z.string().trim().min(6).max(10) }),
  z.object({ action: z.literal("disable"), code: z.string().trim().min(6).max(20) }),
  z.object({ action: z.literal("recovery"), code: z.string().trim().min(6).max(20) }),
]);

// POST /api/me/2fa — begin setup (QR + secret), confirm with a code, regenerate recovery codes, or turn off.
export const POST = withAuth(async (req, { principal }) => {
  const body = schema.parse(await req.json().catch(() => ({})));
  // codes are guessable in theory — keep brute force impossible
  await enforceRateLimit({ name: "2fa", identifier: principal.userId, limit: 10, windowSeconds: 300 });

  if (body.action === "begin") {
    if ((await twoFactorStatus(principal.userId)).enabled) throw AppError.conflict("Tweestapsverificatie staat al aan.");
    const { secret, otpauth } = await beginTwoFactorSetup(principal.userId, principal.email);
    const qrSvg = await QRCode.toString(otpauth, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return NextResponse.json({ secret, otpauth, qrSvg });
  }
  if (body.action === "confirm") {
    const r = await confirmTwoFactorSetup(principal.userId, body.code);
    if (!r.ok) throw AppError.validation("Die code klopt niet. Controleer of de tijd op je telefoon goed staat en probeer de nieuwste code.");
    return NextResponse.json({ enabled: true, recoveryCodes: r.recoveryCodes });
  }
  if (body.action === "recovery") {
    const codes = await regenerateRecoveryCodes(principal.userId, body.code);
    if (!codes) throw AppError.validation("Die code klopt niet.");
    return NextResponse.json({ recoveryCodes: codes });
  }
  const ok = await disableTwoFactor(principal.userId, body.code);
  if (!ok) throw AppError.validation("Die code klopt niet.");
  return NextResponse.json({ enabled: false });
});
