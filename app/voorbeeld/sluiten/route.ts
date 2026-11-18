import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { APP_COOKIE, APP_IOS_COOKIE, APP_CHIP_COOKIE } from "@/lib/app-mode";
import { veiligTerugpad } from "@/lib/http/veilig-terugpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verlaat het ZekerFlex-voorbeeld (de read-only demo): wist de demo-sessie en stuurt door.
// Bewust een GET, zodat het nooit op de alleen-lezen 423 vastloopt zoals het uitloggen (een POST) deed.
// Achter Caddy is request.url de interne host; doorsturen gaat daarom naar APP_BASE_URL (zoals /voorbeeld/werker).
export async function GET(request: Request): Promise<NextResponse> {
  const basis = new URL(env.APP_BASE_URL);
  const gevraagd = veiligTerugpad(new URL(request.url).searchParams.get("naar"));
  const doel = new URL(gevraagd, basis);
  // dubbele zekerheid tegen een open redirect: nooit naar een vreemde host, alleen de eigen site
  const naar = doel.origin === basis.origin ? doel : new URL("/", basis);
  const res = NextResponse.redirect(naar);
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
