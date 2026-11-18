import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { APP_COOKIE, APP_IOS_COOKIE, APP_CHIP_COOKIE } from "@/lib/app-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Alleen een eigen, relatief pad teruggeven; nooit doorsturen naar een vreemde site. */
function veiligNaar(raw: string | null): string {
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !raw.includes("\\")) return raw;
  return "/";
}

// Verlaat het ZekerFlex-voorbeeld (de read-only demo): wist de demo-sessie en stuurt door.
// Bewust een GET, zodat het nooit op de alleen-lezen 423 vastloopt zoals het uitloggen (een POST) deed.
// Achter Caddy is request.url de interne host; doorsturen gaat daarom naar APP_BASE_URL (zoals /voorbeeld/werker).
export async function GET(request: Request): Promise<NextResponse> {
  const naar = veiligNaar(new URL(request.url).searchParams.get("naar"));
  const res = NextResponse.redirect(new URL(naar, env.APP_BASE_URL));
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = raw ? await decodeSession(raw) : null;
  // Alleen een demo-sessie wissen; een echte gebruiker die hier per ongeluk komt, blijft ingelogd.
  if (claims?.inspect) {
    for (const naam of [SESSION_COOKIE, APP_COOKIE, APP_IOS_COOKIE, APP_CHIP_COOKIE]) {
      res.cookies.set(naam, "", { path: "/", maxAge: 0 });
    }
  }
  return res;
}
