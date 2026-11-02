import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { readMedia, siteOfTenant } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/sites/media/<file> — a photo of my own site, for the builder's preview.
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  try {
    const p = await requirePrincipal();
    const site = await siteOfTenant(await siteTenantOf(p));
    const { file } = await params;
    if (!site) return new Response("Niet gevonden", { status: 404 });
    const bytes = await readMedia(site.id, file);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return Response.json(body, { status });
  }
}
