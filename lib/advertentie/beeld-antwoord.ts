import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { RijVol } from "@/lib/advertentie/render-rij";

// Gedeeld door de beeldroutes van de advertenties en de logo maker.

/** Een fout van een beeldroute als antwoord: een volle renderwachtrij is een 503 met Retry-After, de rest gaat via jsonError. */
export function beeldFout(err: unknown): NextResponse {
  if (err instanceof RijVol) {
    return NextResponse.json({ error: { code: "RENDER_DRUK", message: "Het is even druk. Probeer het over een paar seconden opnieuw." } }, { status: 503, headers: { "Retry-After": "5" } });
  }
  return jsonError(err);
}

/** Hoeveel NIEUWE watermerkbeelden één IP mag laten renderen; beelden uit het geheugen tellen hier niet mee. */
export const RENDER_PER_IP = 120;

/** Telt één render voor dit IP (429 bij te veel; bij een storing in Redis gaat het verzoek door). Aanroepen vlak vóór het renderen van een misser. */
export async function telRender(soort: "advertentie" | "logo", ip: string): Promise<void> {
  await enforceRateLimit({ name: `${soort}-render`, identifier: ip, limit: RENDER_PER_IP, windowSeconds: 600, message: "Je hebt in korte tijd veel beelden laten maken. Probeer het over een paar minuten opnieuw." });
}
