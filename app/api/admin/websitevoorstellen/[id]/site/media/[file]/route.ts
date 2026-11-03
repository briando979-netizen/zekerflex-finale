import { withAdminAccess } from "@/lib/auth/handlers";
import { readMedia } from "@/lib/sites/store";
import { editableProposalSite } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/websitevoorstellen/<id>/site/media/<file> — a photo of a proposal's site, for the builder's preview.
export const GET = withAdminAccess<{ id: string; file: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const site = await editableProposalSite(params.id);
  const bytes = await readMedia(site.id, params.file);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
});
