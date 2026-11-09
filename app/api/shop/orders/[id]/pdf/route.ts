import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPrincipal } from "@/lib/auth";
import { shopOrderReceiptPdf } from "@/lib/pdf/documents";
import { controleerBonToken } from "@/lib/shop/bon-token";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/shop/orders/:id/pdf?t=<token> — bon van een webshopbestelling als PDF.
// /shop is gast-checkout, dus er is geen account om op te controleren. Het
// bestelnummer alleen is daarom niet genoeg: de link uit de mail / bevestigings-
// pagina draagt een getekend token (lib/shop/bon-token.ts). Een ingelogde klant
// die de bestelling onder zijn eigen e-mailadres heeft gedaan, mag er ook bij.
// Geen 403 (CrowdSec): ongeldig = 404, verlopen = 410.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  try {
    await enforceRateLimit({
      name: "shop-order-pdf",
      identifier: clientIp(req),
      limit: 30,
      windowSeconds: 600,
      message: "Te veel aanvragen vanaf dit adres, probeer het over enkele minuten opnieuw.",
    });
  } catch (error) {
    return jsonError(error);
  }

  const niet = () => NextResponse.json({ error: { code: "NOT_FOUND", message: "Bestelling niet gevonden" } }, { status: 404 });
  const uitslag = controleerBonToken(params.id, new URL(req.url).searchParams.get("t"));
  if (uitslag === "verlopen") {
    return NextResponse.json(
      { error: { code: "BON_VERLOPEN", message: "Deze link is verlopen. Log in op je shopaccount of neem contact met ons op voor een nieuwe bon." } },
      { status: 410 },
    );
  }
  if (uitslag !== "geldig") {
    const principal = await getPrincipal().catch(() => null);
    if (!principal) return niet();
    const order = await prisma.shopOrder.findUnique({ where: { id: params.id }, select: { email: true } });
    if (!order || order.email.toLowerCase() !== principal.email.toLowerCase()) return niet();
  }

  const doc = await shopOrderReceiptPdf(params.id);
  if (!doc) return niet();
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
