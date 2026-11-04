import { laadRijschool } from "@/lib/rijschool/pagina";
import { eigenAdres } from "@/lib/rijschool/domein";
import { openbareUrls, sitemapXml } from "@/lib/rijschool/vindbaar";
import { SITE } from "@/lib/seo";

export const runtime = "nodejs";

// De sitemap van één rijschoolsite. Op haar eigen domein is dit /sitemap.xml
// (lib/rijschool/domein-pad.ts), en robots.txt daar wijst ernaar. De adressen
// zijn de canonical van elke pagina. Niet online: geen sitemap.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const r = await laadRijschool((await params).slug);
  if (!r || !r.online) return new Response("Niet gevonden", { status: 404 });
  const urls = openbareUrls(r, await eigenAdres(r.id), SITE.url);
  return new Response(sitemapXml(urls, r.updatedAt), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
