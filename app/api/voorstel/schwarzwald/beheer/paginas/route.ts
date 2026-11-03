import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { ACTIVITEITEN, BASE } from "@/lib/voorstel/schwarzwald";
import { paginaPaden, pagina } from "@/lib/voorstel/schwarzwald-paginas";
import { bewerktePaden, paginaVoorSite, platteTekst, slaPaginaOp, zetPaginaTerug } from "@/lib/voorstel/schwarzwald-cms";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teksten bewerken in het beheer.
// GET            → lijst van pagina's (titel, bewerkt ja/nee)
// GET ?pad=/x    → de bewerkbare velden van één pagina
// PUT {pad,…}    → opslaan; DELETE {pad} → terug naar de originele tekst

// hun pad -> ons adres (activiteiten en een paar overzichten hebben een eigen route)
function siteUrl(pad: string): string {
  const act = ACTIVITEITEN.find((a) => a.bron === pad);
  if (act) return `${BASE}/activiteiten/${act.slug}`;
  const vast: Record<string, string> = { "/": BASE, "/activiteiten": `${BASE}/activiteiten`, "/themafeest": `${BASE}/themafeesten`, "/reserveren": `${BASE}/reserveren` };
  return vast[pad] ?? `${BASE}${pad}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    const pad = new URL(request.url).searchParams.get("pad");
    if (!pad) {
      const bewerkt = new Set(await bewerktePaden());
      const lijst = paginaPaden().map((p) => ({ pad: p, titel: pagina(p)?.titel ?? p, bewerkt: bewerkt.has(p), url: siteUrl(p) }));
      return NextResponse.json({ paginas: lijst.sort((a, b) => a.pad.localeCompare(b.pad)) });
    }
    const p = await paginaVoorSite(pad);
    if (!p) throw AppError.notFound("Pagina niet gevonden.");
    return NextResponse.json({
      pad,
      titel: p.titel,
      heroKop: p.heroKop,
      blokken: p.blokken.map((b, index) => {
        if (b.type === "kop") return { index, soort: "kop", tekst: b.tekst };
        if (b.type === "alinea") return { index, soort: "alinea", tekst: platteTekst(b.runs), opmaak: b.runs.some((r) => r.b || r.href) };
        if (b.type === "lijst") return { index, soort: "lijst", regels: b.items.map(platteTekst) };
        if (b.type === "pakketten") return { index, soort: "vast", omschrijving: `${b.pakketten.length} arrangementen met prijzen` };
        if (b.type === "foto") return { index, soort: "vast", omschrijving: "Foto" };
        if (b.type === "usps") return { index, soort: "vast", omschrijving: `Voordelen: ${b.items.join(" · ")}` };
        if (b.type === "knop") return { index, soort: "vast", omschrijving: `Knop: ${b.tekst}` };
        if (b.type === "video") return { index, soort: "vast", omschrijving: "Video (YouTube)" };
        return { index, soort: "vast", omschrijving: "Tabel" };
      }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.object({
  pad: z.string().max(200),
  titel: z.string().max(200),
  heroKop: z.string().max(300),
  blokken: z.record(z.string().regex(/^\d+$/), z.union([z.string().max(5000), z.array(z.string().max(500)).max(100)])),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige wijziging.");
    const { pad, titel, heroKop, blokken } = parsed.data;
    const opgeslagen = await slaPaginaOp(pad, { titel, heroKop, blokken: Object.fromEntries(Object.entries(blokken).map(([k, v]) => [Number(k), v])) });
    return NextResponse.json({ ok: true, titel: opgeslagen.titel });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.pick({ pad: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekende pagina.");
    await zetPaginaTerug(parsed.data.pad);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
