import { whitepaperBySlug } from "@/lib/kennis/whitepapers";
import { renderWhitepaperPdf, whitepaperPdfFilename } from "@/lib/pdf/whitepaper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/kennis/whitepaper/<slug> — the whitepaper as a branded PDF download.
// Public, no DB/Redis. Content is static so the response can be cached.
export function GET(_req: Request, { params }: { params: { slug: string } }): Response {
  const wp = whitepaperBySlug(params.slug);
  if (!wp) return new Response("Not found", { status: 404 });

  const pdf = renderWhitepaperPdf(wp);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${whitepaperPdfFilename(wp)}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
