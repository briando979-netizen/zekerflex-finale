import { withAdminAccess } from "@/lib/auth/handlers";
import { bestandAntwoord, bestandItem } from "@/lib/video/bestanden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/video/bestand/<id> — een foto, video of geluid van de video-editor.
// Alleen voor beheerders; met Range zodat terugspoelen en Safari werken.
export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params }) => {
  const item = await bestandItem(params.id);
  if (!item) return new Response("Dit bestand bestaat niet (meer).", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  return bestandAntwoord(item, request.headers.get("range"));
});
