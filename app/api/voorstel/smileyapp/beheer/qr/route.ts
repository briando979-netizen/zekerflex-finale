import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { jsonError } from "@/lib/http/errors";
import { eisToegang } from "@/lib/voorstel/smileyapp-accounts";
import { smileyPoort } from "@/lib/voorstel/smileyapp-poort";
import { demoQrAdres, demoQrSvg, qrBestandsnaam } from "@/lib/voorstel/smileyapp-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De QR-code naar de demo-aanvraag als bestand, voor het team van SmileyApp.
// GET ?vorm=svg|png[&bron=beurs] → het bestand, met Content-Disposition.
// Bewust zonder bestandsextensie in het pad: op het subdomein wordt een pad
// met een punt niet omgezet (lib/voorstel/subdomein.ts). Eigen site → limiet
// per IP → sessie of PLATFORM_ADMIN; niet ingelogd = 401.

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request);
    await eisToegang();
    const q = new URL(request.url).searchParams;
    const bron = q.get("bron") ?? undefined;
    const vorm = q.get("vorm") === "png" ? "png" : "svg";
    const headers: Record<string, string> = {
      "Content-Type": vorm === "png" ? "image/png" : "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${qrBestandsnaam(bron, vorm)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    };
    if (vorm === "svg") return new NextResponse(demoQrSvg(bron), { headers });
    // groot genoeg voor drukwerk (A5 en groter), in het donkergroen van SmileyApp op wit
    const png = await QRCode.toBuffer(demoQrAdres(bron), { type: "png", width: 1600, margin: 4, errorCorrectionLevel: "M", color: { dark: "#0E2A20", light: "#FFFFFF" } });
    return new NextResponse(new Uint8Array(png), { headers });
  } catch (err) {
    return jsonError(err);
  }
}
