import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { naarOpenbaar } from "@/lib/offertes/model";
import { offerteVanToken, reageerOpToken } from "@/lib/offertes/store";
import { leesJson } from "@/lib/offertes/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een link die niet bestaat, ingetrokken is of vervangen is, krijgt dezelfde tekst: een klant (of gokker) hoort het verschil niet.
const NIET_GEVONDEN = "Deze offerte-link bestaat niet (meer) of is ingetrokken. Vraag het bedrijf om een nieuwe link.";

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/offerte-link/<token>: de offerte zoals de klant hem mag zien (bedrijfsnaam, regels, korting, geldig tot,
 * voorwaarden, status). Openbaar (valt onder /api/offerte-link), IP-begrensd. De token in het adres is de sleutel; hij
 * wordt nergens gelogd en alleen als hash bewaard. Nooit andere offertes, klanten of interne velden.
 */
export async function GET(request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "offerte-link-lezen", identifier: clientIp(request), limit: 60, windowSeconds: 600 });
    const { token } = await ctx.params;
    const gevonden = await offerteVanToken(token);
    if (!gevonden) throw AppError.notFound(NIET_GEVONDEN);
    return NextResponse.json({ offerte: naarOpenbaar(gevonden.offerte, new Date()) }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/offerte-link/<token> met { actie: "accepteer" | "wijs-af", naam, akkoord, reden, website }.
 * Akkoord vraagt de naam en een vinkje; afwijzen mag met een reden. Een verborgen veld (website) vangt bots. Een tweede
 * reactie of een reactie op een verlopen offerte geeft 409. Het IP-adres wordt alleen voor de begrenzing gebruikt, niet bewaard.
 */
export async function POST(request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "offerte-link-reageren", identifier: clientIp(request), limit: 12, windowSeconds: 3600, message: "Je hebt vaak gereageerd. Probeer het over een uur opnieuw of neem contact op met het bedrijf." });
    const { token } = await ctx.params;
    const o = await leesJson(request);
    // een mens ziet dit veld niet; een bot vult het wel in. We doen alsof het gelukt is en bewaren niets.
    if (typeof o.website === "string" && o.website.trim()) return NextResponse.json({ ok: true });
    const keuze = o.actie === "accepteer" ? "geaccepteerd" : o.actie === "wijs-af" ? "afgewezen" : null;
    if (!keuze) throw AppError.validation("Kies of je akkoord gaat of de offerte afwijst.");
    if (keuze === "geaccepteerd" && o.akkoord !== true) throw AppError.validation("Zet het vinkje om akkoord te gaan met deze offerte en de voorwaarden.");
    const nieuw = await reageerOpToken(token, keuze, typeof o.naam === "string" ? o.naam : "", typeof o.reden === "string" ? o.reden : "", new Date());
    if (!nieuw) throw AppError.notFound(NIET_GEVONDEN);
    return NextResponse.json({ ok: true, offerte: naarOpenbaar(nieuw, new Date()) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
