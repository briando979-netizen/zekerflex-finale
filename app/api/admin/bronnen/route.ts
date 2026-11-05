import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { kvGet } from "@/lib/storage/kv";
import { BRON_IDS, BRONNEN, isBronId } from "@/lib/bronnen/catalogus";
import { alleLaatste, kBeeld, reeksVan } from "@/lib/bronnen/store";
import { haalEnBewaar } from "@/lib/bronnen/tick";
import { SCHERM_PAGINAS } from "@/lib/bronnen/haal";
import { scraperGezond, scraperIngesteld } from "@/lib/bronnen/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → AI & automatisering → Bronnen. GET = alle bronnen met hun laatste
// meting en de reeks van de pompprijzen; ?beeld=/pad geeft de schermafdruk
// (PNG) van een pagina. POST { id } haalt één bron nu op.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const q = new URL(request.url).searchParams;
  const beeld = q.get("beeld");
  if (beeld !== null) {
    if (!(SCHERM_PAGINAS as readonly string[]).includes(beeld)) throw AppError.notFound("Onbekende pagina.");
    const b = await kvGet<{ png: string; op: string }>(kBeeld(beeld));
    if (!b?.png) throw AppError.notFound("Nog geen schermafdruk.");
    return new NextResponse(Buffer.from(b.png, "base64"), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300", "x-gemaakt": b.op } });
  }
  const [laatste, brandstof, scraper] = await Promise.all([alleLaatste(), reeksVan("brandstof", 60), scraperGezond()]);
  return NextResponse.json({
    bronnen: BRON_IDS.map((id) => ({ ...BRONNEN[id], laatste: laatste[id] })),
    brandstofReeks: brandstof,
    schermPaginas: SCHERM_PAGINAS,
    scraper: { ingesteld: scraperIngesteld(), gezond: scraper },
  });
});

const schema = z.object({ id: z.string() });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !isBronId(parsed.data.id)) throw AppError.validation("Onbekende bron.");
  const meting = await haalEnBewaar(parsed.data.id);
  return NextResponse.json({ meting });
});
