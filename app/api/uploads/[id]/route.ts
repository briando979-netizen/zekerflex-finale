import { z } from "zod";
import { readUpload } from "@/lib/storage/local";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

// GET /api/uploads/:id - stream a stored file back (PLATFORM_ADMIN).
export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
  const { id } = paramsSchema.parse(params);

  const file = await readUpload(id);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      // Alleen beeld en PDF tonen we in de browser; de rest komt als download.
      "Content-Disposition": `${file.mimeType.startsWith("image/") || file.mimeType === "application/pdf" ? "inline" : "attachment"}; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
