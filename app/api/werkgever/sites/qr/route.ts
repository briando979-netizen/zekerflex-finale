import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { siteAdres } from "@/lib/sites/adres";
import { winkelSiteOf } from "@/lib/sites/store";
import { winkelVan } from "@/lib/sites/winkel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/sites/qr?product=<id>&formaat=svg|png[&download=1] — Studio → Webshop → Groei → Delen:
// een QR-code naar een productpagina (zonder product: naar de winkel), voor een poster, flyer of het
// schap. Op de server gemaakt (qrcode); PNG groot genoeg voor drukwerk. Alleen voor de eigen webshop.

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const q = new URL(request.url).searchParams;
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    const id = q.get("product");
    const product = id ? winkelVan(site).producten.find((x) => x.id === id) : undefined;
    if (id && !product) throw AppError.notFound("Dit product bestaat niet (meer).");
    const { adres } = await siteAdres(site);
    const doel = product ? `${adres}/p/${product.slug}` : `${adres}/winkel`;
    const png = q.get("formaat") === "png";
    const headers: Record<string, string> = {
      "Content-Type": png ? "image/png" : "image/svg+xml",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    };
    // de slug bestaat alleen uit a-z, 0-9 en streepjes: veilig in een bestandsnaam
    if (q.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="qr-${product?.slug ?? "winkel"}.${png ? "png" : "svg"}"`;
    if (png) return new NextResponse(new Uint8Array(await QRCode.toBuffer(doel, { type: "png", width: 1200, margin: 2, errorCorrectionLevel: "M" })), { headers });
    return new NextResponse(await QRCode.toString(doel, { type: "svg", margin: 2, errorCorrectionLevel: "M" }), { headers });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
