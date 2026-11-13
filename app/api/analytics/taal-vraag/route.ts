import { NextResponse } from "next/server";
import { clientIp } from "@/lib/http/request";
import { TAALVRAAG_COOKIE, telTaalVraag } from "@/lib/i18n/taal-vraag";
import { fixedWindow, privateRateLimitIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/analytics/taal-vraag — telt één sessie op de eerste taalcode uit Accept-Language (lib/i18n/taal-vraag.ts).
// Door AnalyticsBeacon één keer per sessie aangeroepen; het sessiecookie "al geteld" houdt een tweede telling tegen.
// Anoniem: geen IP (alleen gehasht in de limiet, 20 per uur), geen gebruiker, geen pad. Altijd 204: een beacon krijgt nooit een fout en blokkeert niets.
/** Per IP hoogstens 20 tellingen per uur: het cookie stopt een browser, deze grens een script. */
const LIMIET = 20;
const VENSTER_SECONDEN = 3600;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor/i;

export async function POST(request: Request): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  try {
    if (BOT.test(request.headers.get("user-agent") ?? "")) return res;
    if ((request.headers.get("cookie") ?? "").includes(`${TAALVRAAG_COOKIE}=1`)) return res;
    // Het IP gaat gehasht (HMAC) de limiet in, nooit leesbaar in Redis/KV. Boven de limiet: stil 204 zonder te tellen.
    // Faalt de limiet zelf (Redis, geheim), dan wel tellen: een storing mag de telling niet stilleggen.
    let boven = false;
    try {
      const poort = await fixedWindow(`rl:taal-vraag:${privateRateLimitIdentifier(clientIp(request))}`, LIMIET, VENSTER_SECONDEN);
      boven = !poort.ok;
    } catch {
      boven = false;
    }
    if (boven) return res;
    await telTaalVraag(request.headers.get("accept-language"));
    res.cookies.set(TAALVRAAG_COOKIE, "1", { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  } catch {
    /* fail-open */
  }
  return res;
}