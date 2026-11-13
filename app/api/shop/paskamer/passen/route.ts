import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SITE } from "@/lib/seo";
import { controleerFoto, PER_DAG, PER_UUR, PASDIENST_NAAM } from "@/lib/shop/pasdienst-kern";
import { pasdienstBeschikbaar, pasOp } from "@/lib/shop/pasdienst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET  /api/shop/paskamer/passen — staat de echte paskamer aan? (de paskamer toont de knop alleen dan)
// POST /api/shop/paskamer/passen { productId, foto, toestemming: true } — een kledingstuk echt op de eigen foto
// (lib/shop/pasdienst.ts). Openbaar (onder /api/shop): begrensd per bezoeker en met een dagplafond in euro's; de foto
// gaat alleen voor dit ene beeld naar de pasdienst en wordt bij ons nergens bewaard of gelogd. Zonder uitdrukkelijke
// toestemming in dit verzoek gaat er niets weg.

const schema = z.object({
  productId: z.string().min(1).max(64),
  foto: z.string(),
  toestemming: z.literal(true),
});

const geenOpslag = { "Cache-Control": "private, no-store" };

export async function GET(): Promise<NextResponse> {
  const b = await pasdienstBeschikbaar().catch(() => ({ aan: false as const, reden: "uit" as const }));
  return NextResponse.json({ aan: b.aan, dienst: PASDIENST_NAAM }, { headers: geenOpslag });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw AppError.validation("Vink eerst aan dat je foto voor dit ene beeld naar de pasdienst mag.");
    const foto = controleerFoto(body.data.foto);
    if (!foto.ok) throw AppError.validation(foto.fout === "te-groot" ? "Deze foto is te groot. Kies een kleinere foto." : "Kies een foto (JPEG, PNG of WebP).");
    const ip = clientIp(req);
    await enforceRateLimit({ name: "pasdienst-uur", identifier: ip, limit: PER_UUR, windowSeconds: 3600, message: "Je maakte net veel pasbeelden. Probeer het over een uur opnieuw." });
    await enforceRateLimit({ name: "pasdienst-dag", identifier: ip, limit: PER_DAG, windowSeconds: 86_400, message: "Voor vandaag heb je genoeg pasbeelden gemaakt. Probeer het morgen weer." });
    const kleding = await prisma.shopProduct.findFirst({ where: { id: body.data.productId, active: true }, select: { imageUrl: true, category: true, name: true } });
    if (!kleding) throw AppError.notFound("Dit kledingstuk bestaat niet (meer).");
    const uit = await pasOp(foto.foto, kleding, SITE.url);
    return NextResponse.json({ beeld: uit.beeld }, { headers: geenOpslag });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status, headers: geenOpslag });
  }
}
