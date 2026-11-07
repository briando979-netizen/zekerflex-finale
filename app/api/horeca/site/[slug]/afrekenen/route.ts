import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { lees } from "@/lib/horeca/schema";
import { publiekeZaak } from "@/lib/horeca/toegang";
import { heeftModule } from "@/lib/horeca/modules";
import { tafelVanCode } from "@/lib/horeca/bestellingen";
import { fooiOpties } from "@/lib/horeca/kassa";
import { bonRegels } from "@/lib/horeca/ideal";
import { afrekenStand, onlineAfrekenenAan, openRekening, startAfrekenen } from "@/lib/horeca/betalen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een gast aan tafel rekent zelf af met iDEAL (QR-bestelpagina). Openbaar,
// daarom: IP-begrensd, alleen met een geldige tafelcode, en POST alleen van de
// eigen site. Het bedrag komt van de server (de open regels van de tafel).
//   GET ?code=        → de open rekening en de fooi-knoppen
//   GET ?code=&b=     → de stand van een betaling (na terugkeer van Stripe)
//   POST {code, fooiCent} → { url } van de betaalpagina van Stripe

const startSchema = z.object({ code: z.string().min(6).max(40), fooiCent: z.number().int().min(0).max(10_000).default(0) });

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

async function tafelVan(slug: string, code: string) {
  const zaak = await publiekeZaak(slug);
  if (!heeftModule(zaak, "qr") || !heeftModule(zaak, "betalen")) throw AppError.precondition("Online afrekenen staat bij deze zaak uit. Vraag de bediening om de rekening.");
  const tafel = code.length >= 6 && code.length <= 40 ? await tafelVanCode(zaak.id, code) : null;
  if (!tafel) throw AppError.notFound("Deze QR-code werkt niet meer. Vraag de bediening om een nieuwe.");
  return { zaak, tafel };
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "horeca-afrekenen-kijk", identifier: clientIp(request), limit: 120, windowSeconds: 600, message: "Even geduld, probeer het zo opnieuw." });
    const q = new URL(request.url).searchParams;
    const { zaak, tafel } = await tafelVan((await params).slug, q.get("code") ?? "");
    const b = q.get("b");
    if (b) return NextResponse.json(await afrekenStand(zaak.id, tafel.id, b.slice(0, 40)));
    const { regels, totaalCent } = await openRekening(zaak.id, tafel.id);
    return NextResponse.json({ tafel: tafel.naam, kan: await onlineAfrekenenAan(zaak), regels: bonRegels(regels), totaalCent, fooiOpties: fooiOpties(totaalCent) });
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "horeca-afrekenen", identifier: clientIp(request), limit: 10, windowSeconds: 600, message: "Je hebt al een paar keer geprobeerd af te rekenen. Vraag de bediening even." });
    const s = lees(startSchema, await request.json().catch(() => null));
    const { zaak, tafel } = await tafelVan((await params).slug, s.code);
    return NextResponse.json({ url: await startAfrekenen(zaak, tafel, s.code, s.fooiCent) });
  } catch (err) {
    return fout(err);
  }
}
