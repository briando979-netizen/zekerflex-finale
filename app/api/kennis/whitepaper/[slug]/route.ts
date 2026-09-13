import { whitepaperBySlug } from "@/lib/kennis/whitepapers";
import { renderWhitepaperPdf, whitepaperPdfFilename } from "@/lib/pdf/whitepaper";
import { recordServerEvent } from "@/lib/analytics/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/kennis/whitepaper/<slug> — the whitepaper as a branded PDF download.
// Public. The PDF itself is static (cacheable); the download is logged as a
// conversion so /admin/analytics shows which whitepaper actually pulls.
export async function GET(_req: Request, props: { params: Promise<{ slug: string }> }): Promise<Response> {
  const params = await props.params;
  const wp = whitepaperBySlug(params.slug);
  if (!wp) return new Response("Not found", { status: 404 });

  void recordServerEvent({
    path: `/kennis/whitepapers/${wp.slug}`,
    label: "whitepaper-download",
    meta: { slug: wp.slug, title: wp.title },
  });

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
