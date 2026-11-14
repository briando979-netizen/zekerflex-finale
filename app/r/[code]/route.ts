import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { BANK_AAN } from "@/lib/app-mode";
import { REF_COOKIE, userForCode } from "@/lib/rewards/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /r/<code> — invite link: remember the code for 30 days, then to sign-up.
// De doorverwijsbonus werd op ZekerFlex Bank gestort en staat met de bank uit (lib/app-mode.ts, BANK_AAN): dan geen cookie,
// alleen door naar aanmelden. Een cookie zonder doel past niet bij "functioneel" (/cookiebeleid, lib/privacy/cookies.ts).
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/register", env.APP_BASE_URL));
  if (BANK_AAN && (await userForCode(code))) {
    res.cookies.set(REF_COOKIE, code.toUpperCase(), { maxAge: 30 * 86_400, httpOnly: true, sameSite: "lax", secure: env.APP_BASE_URL.startsWith("https"), path: "/" });
  }
  return res;
}
