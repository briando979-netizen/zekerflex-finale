import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { leesAutorisatie, maakCode } from "@/lib/oidc/aanbieder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stap 1 van "Inloggen met ZekerFlex": de dienst (kennisbank) stuurt de gebruiker
// hierheen. Is die ingelogd bij ZekerFlex, dan gaat hij meteen met een code
// terug; anders eerst naar de gewone inlogpagina en daarna hierheen terug.
// Eigen diensten op de server, dus geen toestemmingsscherm.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const { a } = leesAutorisatie(url.searchParams);
    const p = await getPrincipal();
    if (!p) {
      const terug = `${url.pathname}${url.search}`;
      return NextResponse.redirect(`${env.APP_BASE_URL.replace(/\/$/, "")}/login?callbackUrl=${encodeURIComponent(terug)}`, 302);
    }
    if (!p.emailVerifiedAt) throw AppError.forbidden("Bevestig eerst je e-mailadres bij ZekerFlex.");
    const code = await maakCode(p, a);
    const doel = new URL(a.redirectUri);
    doel.searchParams.set("code", code);
    if (a.state) doel.searchParams.set("state", a.state);
    return NextResponse.redirect(doel.toString(), 302);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
