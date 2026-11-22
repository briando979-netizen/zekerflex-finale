import { idUitPad, type Bericht } from "@/lib/community/regels";
import { leesOnderwerp, leesReacties } from "@/lib/community/store";
import { readProfileImage } from "@/lib/profile/media";
import { getUserProfileExtra } from "@/lib/profile/store";
import { prisma } from "@/lib/prisma";
import { ERASED_EMAIL_DOMAIN } from "@/lib/privacy/gewist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NIET_GEVONDEN = () => new Response("Niet gevonden", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

// GET /api/community/avatar/<onderwerp>/<o | reactie-id>: de profielfoto van de schrijver van een zichtbaar bericht, klein
// (128 px, WebP, zonder EXIF). Openbaar (lib/auth/public-routes.ts) maar per bericht, zodat het id van de schrijver nergens in
// een adres staat. De profielfoto kan veranderen: een dag cache, geen "immutable".
export async function GET(_req: Request, props: { params: Promise<{ onderwerpId: string; wie: string }> }): Promise<Response> {
  const { onderwerpId, wie } = await props.params;
  const id = idUitPad(onderwerpId);
  if (!id || !/^(?:o|[a-z0-9]{4,32})$/.test(wie)) return NIET_GEVONDEN();
  const onderwerp = await leesOnderwerp(id).catch(() => null);
  if (!onderwerp || onderwerp.status !== "zichtbaar") return NIET_GEVONDEN();
  const bericht: Bericht | null = wie === "o" ? onderwerp : ((await leesReacties(id).catch(() => [])).find((r) => r.id === wie) ?? null);
  if (!bericht || bericht.status !== "zichtbaar" || !bericht.auteurId || bericht.gewist || bericht.team) return NIET_GEVONDEN();
  const schrijver = await prisma.user.findUnique({ where: { id: bericht.auteurId }, select: { email: true } }).catch(() => null);
  if (!schrijver || schrijver.email.endsWith(`@${ERASED_EMAIL_DOMAIN}`)) return NIET_GEVONDEN();
  const extra = await getUserProfileExtra(bericht.auteurId).catch(() => null);
  if (!extra?.avatarUploadId) return NIET_GEVONDEN();
  const img = await readProfileImage(extra.avatarUploadId);
  if (!img) return NIET_GEVONDEN();
  try {
    const { cleanImage } = await import("@/lib/media/clean-image");
    const klein = await cleanImage(img.bytes, 128);
    return new Response(new Uint8Array(klein.bytes), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NIET_GEVONDEN();
  }
}
