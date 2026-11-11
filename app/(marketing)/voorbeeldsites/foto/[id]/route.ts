import { logger } from "@/lib/logger";
import { webshopTemplate } from "@/lib/sites/webshop-templates";
import { winkelVoorbeeldKaart } from "@/lib/sites/winkel-demo";
import { winkelVoorbeeldVoorOntwerp } from "@/lib/sites/winkel-voorbeelden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /voorbeeldsites/foto/<ontwerp> — de kaartfoto van een voorbeeldwebshop op
// /voorbeeldsites: de openingsfoto van de winkel zelf, klein, van onze eigen
// server (lib/sites/winkel-demo.ts). Zolang de winkel nog geen foto heeft, een
// vlak in de kleuren van het ontwerp (alleen vormen), kort bewaard.
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const v = winkelVoorbeeldVoorOntwerp(id);
  if (!v) return new Response("Niet gevonden", { status: 404 });
  const foto = await winkelVoorbeeldKaart(v).catch((err) => {
    logger.warn("shop example card photo failed", { ontwerp: v.id, err: String(err) });
    return null;
  });
  if (foto) return new Response(new Uint8Array(foto), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400" } });
  const t = webshopTemplate(v.id);
  const vlak = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" width="900" height="600"><rect width="900" height="600" fill="${t.theme.kleur}"/><circle cx="720" cy="130" r="220" fill="${t.theme.accent}" fill-opacity="0.35"/><rect x="90" y="380" width="320" height="24" rx="12" fill="#ffffff" fill-opacity="0.5"/><rect x="90" y="430" width="200" height="24" rx="12" fill="#ffffff" fill-opacity="0.3"/></svg>`;
  return new Response(vlak, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" } });
}
