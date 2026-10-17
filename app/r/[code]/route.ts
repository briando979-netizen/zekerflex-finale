import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { REF_COOKIE, userForCode } from "@/lib/rewards/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /r/<code> — invite link: remember the code for 30 days, then to sign-up.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/register", env.APP_BASE_URL));
  if (await userForCode(code)) {
    res.cookies.set(REF_COOKIE, code.toUpperCase(), { maxAge: 30 * 86_400, httpOnly: true, sameSite: "lax", secure: env.APP_BASE_URL.startsWith("https"), path: "/" });
  }
  return res;
}
