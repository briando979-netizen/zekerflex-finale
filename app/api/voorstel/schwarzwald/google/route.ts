import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";
import { BASE } from "@/lib/voorstel/schwarzwald";
import { onderteken } from "@/lib/voorstel/schwarzwald-accounts";
import { GOOGLE_COOKIE, GOOGLE_PAD, googleAan, publiekeOrigin, terugkeerAdres, type GoogleState } from "@/lib/voorstel/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start "Inloggen met Google": state + PKCE in een kort, ondertekend cookie,
// dan door naar Google. Het antwoord komt binnen op ./terug.
export async function GET(request: Request): Promise<NextResponse> {
  const origin = publiekeOrigin(request.headers);
  if (!origin) return new NextResponse("Onbekend adres", { status: 400 });
  if (!googleAan()) return NextResponse.redirect(`${origin}${BASE}/account?fout=google-uit`);

  const staat: GoogleState = {
    s: randomBytes(16).toString("base64url"),
    v: randomBytes(32).toString("base64url"),
    o: origin,
    x: Date.now() + 10 * 60_000,
  };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: terugkeerAdres(origin),
    response_type: "code",
    scope: "openid email profile",
    state: staat.s,
    code_challenge: createHash("sha256").update(staat.v).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_COOKIE, onderteken(staat), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GOOGLE_PAD,
    maxAge: 600,
  });
  return res;
}
