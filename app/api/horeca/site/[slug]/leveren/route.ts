import { after, NextResponse } from "next/server";
import { meldNieuweLevering } from "@/lib/horeca/levering-melding";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { gastLeverSchema, lees } from "@/lib/horeca/schema";
import { publiekeZaak } from "@/lib/horeca/toegang";
import { leesMet, tekenMet } from "@/lib/horeca/link";
import { leveringVoorGast, leverOpties, onlineTijdFout, plaatsLevering } from "@/lib/horeca/bezorgen-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een gast bestelt online om af te halen of te laten bezorgen (15 nov 2026, module bezorgen). Openbaar
// (/api/horeca/site in lib/auth/public-routes.ts), daarom: IP-begrensd, alleen van de eigen site, een verborgen
// botveld, en alleen op een tijd die vandaag echt kan. Het adres moet bestaan (PDOK) en binnen de straal liggen; de
// zaak bevestigt de tijd zelf. Prijzen komen van de server. Betalen bij het ophalen of de bezorging.
// GET ?token= → de stand van de eigen bestelling, alleen met de ondertekende link (geen adres of telefoon terug).

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "horeca-leveren", identifier: clientIp(request), limit: 10, windowSeconds: 3600 });
    const zaak = await publiekeZaak((await params).slug);
    const b = lees(gastLeverSchema, await request.json().catch(() => null));
    // een bot vult het verborgen veld in: doe alsof het lukte, maar plaats niets
    if (b.bedrijf.trim()) return NextResponse.json({ ok: true });
    const tijdFout = onlineTijdFout(leverOpties(zaak), b.soort, b.tijd);
    if (tijdFout) throw AppError.validation(tijdFout);
    const { bedrijf: _b, soort, ...inv } = b;
    const best = await plaatsLevering(zaak, { soort, ...inv }, "online");
    // seintje aan de zaak (push en mail), na het antwoord aan de gast
    after(() => meldNieuweLevering(zaak, best));
    return NextResponse.json({ nummer: best.nummer, token: tekenMet(env.AUTH_SECRET, "levering", best.id) });
  } catch (err) {
    return fout(err);
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "horeca-levering-stand", identifier: clientIp(request), limit: 240, windowSeconds: 3600 });
    const zaak = await publiekeZaak((await params).slug);
    const id = leesMet(env.AUTH_SECRET, "levering", new URL(request.url).searchParams.get("token") ?? undefined);
    const stand = id ? await leveringVoorGast(zaak.id, id) : null;
    if (!stand) throw AppError.notFound("Deze bestelling kennen we niet. Controleer de link.");
    return NextResponse.json(stand);
  } catch (err) {
    return fout(err);
  }
}
