import { NextResponse } from "next/server";
import { SITE_PREVIEW_CSP } from "@/lib/security/csp";
import { getMirror, injectPreviewShim, prefixRootRefs, readMirrorFile, resolveMirrorFile } from "@/lib/website/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /website-preview/<id>/<pad> — het voorbeeld van de website-verhuizer.
// De kopie staat met verwijzingen vanaf de root op schijf (zoals hij live gaat);
// hier krijgen die het voorbeeld-pad ervoor. Altijd in de sandbox (opaque origin,
// geen formulieren) en nooit in Google.
const HEADERS = {
  "Content-Security-Policy": SITE_PREVIEW_CSP,
  "X-Robots-Tag": "noindex, nofollow",
  // De sandbox heeft een lege herkomst: lettertypes en modules zijn dan cross-origin.
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "private, max-age=60",
  "Referrer-Policy": "no-referrer",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path = [] } = await params;
  const rec = await getMirror(id);
  if (!rec) return new NextResponse("Dit voorbeeld bestaat niet (meer).", { status: 404, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });

  const found = await resolveMirrorFile(id, path);
  if (!found) {
    const msg = rec.status === "bezig" ? "De kopie wordt nog gemaakt. Probeer het zo opnieuw." : "Deze pagina zit niet in de kopie.";
    return new NextResponse(msg, { status: 404, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  }

  const data = await readMirrorFile(found.file);
  const prefix = `/website-preview/${id}`;
  if (found.type.startsWith("text/html")) {
    return new NextResponse(injectPreviewShim(prefixRootRefs(data.toString("utf8"), prefix, "html")), { headers: { ...HEADERS, "Content-Type": found.type } });
  }
  if (found.type.startsWith("text/css")) {
    return new NextResponse(prefixRootRefs(data.toString("utf8"), prefix, "css"), { headers: { ...HEADERS, "Content-Type": found.type } });
  }
  return new NextResponse(new Uint8Array(data), { headers: { ...HEADERS, "Content-Type": found.type } });
}
