import { NextResponse } from "next/server";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/voorstel/herkomst";
import { isMens, telPad } from "@/lib/voorstel/smileyapp-cijfer-regels";
import { telWeergave } from "@/lib/voorstel/smileyapp-cijfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eén paginaweergave van het SmileyApp-voorstel tellen (openbaar onder
// /api/voorstel/smileyapp). POST {pad, buiten} → altijd 204, ook als de telling
// geweigerd wordt (andere website, te veel, een robot, een onbekend pad): een
// teller is geen reden voor een foutmelding, en een reeks 403's laat CrowdSec
// het adres van een gewone bezoeker blokkeren. Er wordt niets over de bezoeker
// bewaard: het IP dient alleen voor de limiet (die vanzelf verloopt), en van
// de herkomst blijft alleen "van buiten de site of niet" over.

const leeg = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) return leeg();
    if (!zelfdeHerkomst(request.headers, request.url)) return leeg();
    // ruim voor een mens die rondklikt, krap voor een script dat de cijfers wil opblazen
    await enforceRateLimit({ name: "smileyapp-tel", identifier: clientIp(request), limit: 60, windowSeconds: 600 });
    const gelezen = await jsonBegrensd(request, 1_000);
    if (!gelezen.ok || !gelezen.waarde || typeof gelezen.waarde !== "object") return leeg();
    const { pad: ruw, buiten } = gelezen.waarde as { pad?: unknown; buiten?: unknown };
    const pad = telPad(ruw);
    if (!pad || !isMens(request.headers.get("user-agent"), request.headers.get("sec-purpose") ?? request.headers.get("purpose"))) return leeg();
    await telWeergave(pad, buiten === true);
    return leeg();
  } catch {
    // limiet bereikt of Redis even weg: de pagina merkt er niets van
    return leeg();
  }
}
