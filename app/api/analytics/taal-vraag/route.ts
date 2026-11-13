import { NextResponse } from "next/server";
import { TAALVRAAG_COOKIE, telTaalVraag } from "@/lib/i18n/taal-vraag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/analytics/taal-vraag — telt één sessie op de eerste taalcode uit Accept-Language (lib/i18n/taal-vraag.ts).
// Door AnalyticsBeacon één keer per sessie aangeroepen; het sessiecookie "al geteld" houdt een tweede telling tegen.
// Anoniem: geen IP, geen gebruiker, geen pad. Altijd 204: een beacon krijgt nooit een fout en blokkeert niets.
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor/i;

export async function POST(request: Request): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  try {
    if (BOT.test(request.headers.get("user-agent") ?? "")) return res;
    if ((request.headers.get("cookie") ?? "").includes(`${TAALVRAAG_COOKIE}=1`)) return res;
    await telTaalVraag(request.headers.get("accept-language"));
    res.cookies.set(TAALVRAAG_COOKIE, "1", { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  } catch {
    /* fail-open */
  }
  return res;
}