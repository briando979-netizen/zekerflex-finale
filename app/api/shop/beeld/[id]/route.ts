import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage/local";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { toErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De hoofdfoto van een actief product als JPEG, voor de productlijst die Stripe
// deelt met AI-assistenten (lib/shop/agent-handel.ts): Stripe neemt alleen JPEG
// of PNG, en de shop bewaart veel foto's als WebP. Openbaar (onder /api/shop),
// maar alleen de foto die bij een actief product hoort; nooit een andere upload.

const PUBLIEK = path.join(process.cwd(), "public");
const niet = () => NextResponse.json({ error: "Foto niet gevonden" }, { status: 404 });

async function bron(p: { imageUploadId: string | null; imageUrl: string | null }): Promise<Buffer | null> {
  if (p.imageUploadId) return (await readUpload(p.imageUploadId)).bytes;
  const url = (p.imageUrl ?? "").split("?")[0] ?? "";
  const media = /^\/api\/shop\/media\/([a-z0-9]{10,40})$/i.exec(url);
  if (media?.[1]) return (await readUpload(media[1])).bytes;
  if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/api/")) return null;
  const bestand = path.resolve(PUBLIEK, `.${decodeURIComponent(url)}`);
  if (!bestand.startsWith(`${PUBLIEK}${path.sep}`)) return null;
  return readFile(bestand);
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const id = (await props.params).id.replace(/\.jpe?g$/i, "");
  // cuid's, maar ook vaste id's uit de beginvoorraad zoals "shop_hoodie"
  if (!/^[a-z0-9_-]{3,60}$/i.test(id)) return niet();
  try {
    await enforceRateLimit({ name: "shop-beeld", identifier: clientIp(request), limit: 600, windowSeconds: 600 });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
  try {
    const p = await prisma.shopProduct.findFirst({ where: { id, active: true }, select: { imageUploadId: true, imageUrl: true } });
    if (!p) return niet();
    const ruw = await bron(p);
    if (!ruw) return niet();
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(ruw)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return niet();
  }
}
