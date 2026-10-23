import { NextResponse } from "next/server";
import { captchaProvider, issuePowChallenge } from "@/lib/security/captcha";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/captcha/challenge — tells the client which captcha (if any) to render.
// For the sovereign proof-of-work it returns a signed challenge to solve.
export function GET(): NextResponse {
  const provider = captchaProvider();
  if (!provider) return NextResponse.json({ provider: null });
  if (provider === "pow") return NextResponse.json({ provider: "pow", ...issuePowChallenge() });
  return NextResponse.json({ provider, siteKey: env.CAPTCHA_SITE_KEY ?? null });
}
