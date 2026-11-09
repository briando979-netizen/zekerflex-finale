import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { passkeyFoutAntwoord } from "@/lib/auth/passkey/fout";
import { startPasskeyInlog } from "@/lib/auth/passkey/inloggen";
import { INLOG_COOKIE, UITDAGING_SECONDEN } from "@/lib/auth/passkey/uitdaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/passkey — begin van "Inloggen met passkey" (openbaar, zonder sessie):
// een eenmalige challenge (5 min, alleen in Redis) en een httpOnly-cookie dat
// deze browser eraan koppelt. IP-begrensd. Het inloggen zelf gaat via de
// server-actie op /login (signIn("passkey"), lib/auth/passkey/inloggen.ts).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { opties, ceremonieId } = await startPasskeyInlog(clientIp(request));
    const res = NextResponse.json({ publicKey: opties }, { headers: { "Cache-Control": "no-store" } });
    res.cookies.set(INLOG_COOKIE, ceremonieId, {
      httpOnly: true,
      sameSite: "strict",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: UITDAGING_SECONDEN,
    });
    return res;
  } catch (err) {
    return passkeyFoutAntwoord(err) ?? jsonError(err);
  }
}
