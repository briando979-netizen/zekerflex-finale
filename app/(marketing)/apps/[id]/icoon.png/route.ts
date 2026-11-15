import sharp from "sharp";
import { appVan, icoonSvg } from "@/lib/apps/catalogus";

export const runtime = "nodejs";

// Het icoon van een ZekerFlex-app (lib/apps/catalogus.ts): ?maat=192 voor een kleinere versie, ?maskeerbaar=1 voor de
// Android-vorm (vult het hele vlak). Alleen vormen: sharp heeft in de container geen lettertypes.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const app = appVan((await params).id);
  if (!app) return new Response("Niet gevonden", { status: 404 });
  const q = new URL(request.url).searchParams;
  const maat = q.get("maat") === "192" ? 192 : 512;
  const png = await sharp(Buffer.from(icoonSvg(app, q.get("maskeerbaar") === "1")))
    .resize(maat, maat)
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
}
