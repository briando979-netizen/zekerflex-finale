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
import { afrekenStand, onlineAfrekenenAan, openRekening, startAfrekenen, stopAfrekenen } from "@/lib/horeca/betalen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een gast aan tafel rekent zelf af met iDEAL (QR-bestelpagina). Openbaar,
// daarom: IP-begrensd, alleen met een geldige tafelcode, en POST alleen van de
// eigen site. Het bedrag komt van de server (de open regels van de tafel).
//   GET ?code=        → de open rekening en de fooi-knoppen
//   GET ?code=&b=     → de stand van een betaling (na terugkeer van Stripe)
//   POST {code, fooiCent, selectie?} → { url } van de betaalpagina van Stripe
//   POST {code, stop}       → een afgebroken betaling loslaten (gerechten weer vrij)

const startSchema = z.object({
  code: z.string().min(6).max(40),
  fooiCent: z.number().int().min(0).max(10_000).default(0),
  // "alleen wat ik had": welke regels en hoeveel; leeg of weg = alles wat open staat
  selectie: z
    .array(z.object({ bestellingId: z.string().min(1).max(40), index: z.number().int().min(0).max(500), aantal: z.number().int().min(1).max(50) }))
    .max(200)
    .optional(),
  // terug van Stripe via "annuleren": laat deze betaling los
  stop: z.string().min(10).max(40).optional(),
});

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
    const { regels, totaalCent, inBetalingCent } = await openRekening(zaak.id, tafel.id);
    return NextResponse.json({
      tafel: tafel.naam,
      kan: await onlineAfrekenenAan(zaak),
      regels: regels.map((r) => ({ bestellingId: r.bestellingId, index: r.index, naam: r.naam, prijsCent: r.prijsCent, aantal: r.aantal })),
      totaalCent,
      inBetalingCent,
      fooiOpties: fooiOpties(totaalCent),
    });
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
    if (s.stop) {
      await stopAfrekenen(zaak.id, tafel.id, s.stop);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ url: await startAfrekenen(zaak, tafel, s.code, s.fooiCent, s.selectie ?? null) });
  } catch (err) {
    return fout(err);
  }
}
