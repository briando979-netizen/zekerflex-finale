import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { BASE } from "@/lib/voorstel/schwarzwald";
import { leesOndertekend, sessieCookie, viaGoogle } from "@/lib/voorstel/schwarzwald-accounts";
import { GOOGLE_COOKIE, GOOGLE_PAD, publiekeOrigin, terugkeerAdres, type GoogleState } from "@/lib/voorstel/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Terugkeer van Google: state controleren, code inwisselen (met PKCE),
// e-mail ophalen en alleen een door Google bevestigd adres laten inloggen.

function cookieUit(header: string | null, naam: string): string | undefined {
  return header
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${naam}=`))
    ?.slice(naam.length + 1);
}

export async function GET(request: Request): Promise<NextResponse> {
  const q = new URL(request.url).searchParams;
  const staat = leesOndertekend<GoogleState>(cookieUit(request.headers.get("cookie"), GOOGLE_COOKIE));
  const origin = staat?.o ?? publiekeOrigin(request.headers);
  if (!origin) return new NextResponse("Onbekend adres", { status: 400 });

  const naar = (fout?: string) => {
    const res = NextResponse.redirect(`${origin}${BASE}/account${fout ? `?fout=${fout}` : ""}`);
    res.cookies.set(GOOGLE_COOKIE, "", { path: GOOGLE_PAD, maxAge: 0 });
    return res;
  };

  if (!staat || staat.x < Date.now() || q.get("state") !== staat.s) return naar("google-verlopen");
  if (q.get("error") || !q.get("code")) return naar("google-geannuleerd");

  try {
    const token = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: q.get("code") ?? "",
        client_id: env.GOOGLE_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: terugkeerAdres(staat.o),
        grant_type: "authorization_code",
        code_verifier: staat.v,
      }),
    });
    const t = (await token.json()) as { access_token?: string; error?: string };
    if (!token.ok || !t.access_token) {
      logger.warn("schwarzwald google: token mislukt", { status: token.status, error: t.error });
      return naar("google-mislukt");
    }
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } });
    const u = (await info.json()) as { email?: string; email_verified?: boolean; name?: string };
    if (!info.ok || !u.email || u.email_verified !== true) return naar("google-geen-email");

    const account = await viaGoogle({ email: u.email, naam: u.name ?? "" });
    const res = naar();
    const c = sessieCookie(account.email);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (err) {
    logger.warn("schwarzwald google: fout", { error: err instanceof Error ? err.message : String(err) });
    return naar(err instanceof Error && /geblokkeerd/.test(err.message) ? "geblokkeerd" : "google-mislukt");
  }
}
