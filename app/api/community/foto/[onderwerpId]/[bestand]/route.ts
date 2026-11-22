import { getPrincipal, hasRole } from "@/lib/auth";
import { idUitPad, type Bericht } from "@/lib/community/regels";
import { isFotoId, leesFoto } from "@/lib/community/fotos";
import { leesOnderwerp, leesReacties } from "@/lib/community/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NIET_GEVONDEN = () => new Response("Niet gevonden", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

// GET /api/community/foto/<onderwerp>/<foto>.webp: een foto uit de community. Openbaar (lib/auth/public-routes.ts), maar
// alleen als de foto bij een zichtbaar bericht van dat onderwerp hoort. Een verborgen bericht: alleen voor de schrijver en
// beheer, en dan niet in een gedeelde cache. Elke foto is al schoon (WebP, zonder EXIF/GPS) en verandert nooit: lange cache.
export async function GET(_req: Request, props: { params: Promise<{ onderwerpId: string; bestand: string }> }): Promise<Response> {
  const { onderwerpId, bestand } = await props.params;
  const id = idUitPad(onderwerpId);
  const fotoId = bestand.replace(/\.webp$/, "");
  if (!id || !isFotoId(fotoId)) return NIET_GEVONDEN();
  const onderwerp = await leesOnderwerp(id).catch(() => null);
  if (!onderwerp || onderwerp.status === "verwijderd") return NIET_GEVONDEN();
  let bericht: Bericht | null = onderwerp.fotos.includes(fotoId) ? onderwerp : null;
  if (!bericht) bericht = (await leesReacties(id).catch(() => [])).find((r) => r.fotos.includes(fotoId)) ?? null;
  if (!bericht || bericht.status === "verwijderd") return NIET_GEVONDEN();
  const openbaar = bericht.status === "zichtbaar" && onderwerp.status === "zichtbaar";
  if (!openbaar) {
    const p = await getPrincipal().catch(() => null);
    if (!p || !(hasRole(p, "PLATFORM_ADMIN") || p.userId === bericht.auteurId)) return NIET_GEVONDEN();
  }
  const bytes = await leesFoto(fotoId);
  if (!bytes) return NIET_GEVONDEN();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": openbaar ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
