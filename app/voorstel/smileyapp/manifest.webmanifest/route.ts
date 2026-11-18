import { smileyappManifest } from "@/lib/voorstel/smileyapp-app";
import { VOORSTEL_HEADER } from "@/lib/voorstel/subdomein";

export const dynamic = "force-dynamic";

// Het manifest van de SmileyApp-app (PWA): daarmee is de site op een telefoon
// te installeren, met hun eigen naam, kleuren en icoon. Op smileyapp.zekerflex.com
// (Caddy zet de kop) begint de app op "/", op zekerflex.com op /voorstel/smileyapp.
export function GET(request: Request): Response {
  const manifest = smileyappManifest(request.headers.get(VOORSTEL_HEADER) !== null);
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
