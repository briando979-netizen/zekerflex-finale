import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { INSPECT_PARAM, mintInspectLink } from "@/lib/auth/inspect";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { demoInspectTargets } from "@/lib/demo/seed-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Openbare, alleen-lezen deel-link: opent het werker-voorbeeldaccount (de zzp'er/uitzendkracht-weergave). Mint een verse
// inspect-token voor het vaste demo-account en stuurt door naar /dashboard/klussen; de middleware maakt er een
// alleen-lezen sessie van (schrijven = 403).
// achter Caddy is request.url de interne host (0.0.0.0:3000); doorsturen gaat daarom naar APP_BASE_URL (17 nov 2026)
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "voorbeeld-werker", identifier: clientIp(request), limit: 30, windowSeconds: 600, failOpen: true, message: "Even wachten." });
  } catch {
    return NextResponse.redirect(new URL("/voorbeeld", env.APP_BASE_URL));
  }
  const { werker } = await demoInspectTargets();
  if (!werker) return NextResponse.redirect(new URL("/voorbeeld", env.APP_BASE_URL));
  const { token } = await mintInspectLink(werker, 1);
  const url = new URL("/dashboard/klussen", env.APP_BASE_URL);
  url.searchParams.set(INSPECT_PARAM, token);
  return NextResponse.redirect(url);
}
