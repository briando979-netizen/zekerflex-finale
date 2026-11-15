import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { controleerBonToken } from "@/lib/shop/bon-token";
import { magBeoordelen, TEKST_MAX, TEKST_MIN, weergaveNaam } from "@/lib/shop/beoordeling";
import { teBeoordelen } from "@/lib/shop/beoordeling-server";
import type { ShopOrderLine } from "@/lib/shop/bestelling-betaald";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/shop/orders/:id/beoordeling — een koper beoordeelt een product uit zijn eigen bestelling (lib/shop/beoordeling.ts).
// Openbaar (de shop kent geen account), maar alleen met het getekende token uit de mail of van de ingelogde koper
// (app/shop/bestelling/[id]/page.tsx) en pas als de bestelling verzonden is. Opnieuw sturen past de eigen beoordeling aan;
// die wacht dan weer op de beheerder. Een fout token geeft 404, geen 403 (CrowdSec). Het token komt in geen log.

const schema = z.object({
  t: z.string().max(80),
  productId: z.string().min(1).max(40),
  sterren: z.number().int().min(1).max(5),
  tekst: z.string().trim().min(TEKST_MIN).max(TEKST_MAX),
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  try {
    await enforceRateLimit({
      name: "shop-beoordeling",
      identifier: clientIp(req),
      limit: 20,
      windowSeconds: 3600,
      message: "Te veel beoordelingen vanaf dit adres, probeer het later opnieuw.",
    });
    const d = schema.safeParse(await req.json().catch(() => null));
    if (!d.success) throw AppError.validation(`Kies 1 tot 5 sterren en schrijf minstens ${TEKST_MIN} tekens (hooguit ${TEKST_MAX}).`);
    if (controleerBonToken(id, d.data.t) !== "geldig") throw AppError.notFound("Bestelling niet gevonden. Gebruik de link uit je mail.");
    const order = await prisma.shopOrder.findUnique({ where: { id }, select: { status: true, firstName: true, lastName: true, itemsJson: true } });
    if (!order) throw AppError.notFound("Bestelling niet gevonden.");
    if (!magBeoordelen(order.status)) throw AppError.precondition("Je kunt een product beoordelen zodra je bestelling verzonden is.");
    const regels = (order.itemsJson as ShopOrderLine[] | null) ?? [];
    const producten = await teBeoordelen(id, regels);
    if (!producten.some((p) => p.productId === d.data.productId)) throw AppError.validation("Dit product zit niet in je bestelling.");

    const velden = { sterren: d.data.sterren, tekst: d.data.tekst, naam: weergaveNaam(order.firstName, order.lastName), status: "wacht" };
    await prisma.shopReview.upsert({
      where: { orderId_productId: { orderId: id, productId: d.data.productId } },
      create: { orderId: id, productId: d.data.productId, ...velden },
      update: velden,
    });
    return NextResponse.json({ producten: await teBeoordelen(id, regels) });
  } catch (error) {
    return jsonError(error);
  }
}
