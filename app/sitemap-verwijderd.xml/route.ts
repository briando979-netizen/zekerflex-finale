import { SITE } from "@/lib/seo";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { verwijderdePaden } from "@/lib/seo/verwijderd";

export const dynamic = "force-dynamic";

// GET /sitemap-verwijderd.xml (21 nov 2026): de pagina's die uit Google moeten (lib/seo/verwijderd.ts), met de datum van
// vandaag, zodat Google ze snel opnieuw ophaalt en de noindex ziet. Staat in robots.txt naast sitemap.xml. Alleen met de vlag
// publiek-alleen-flexwerk aan; anders leeg. Weghalen zodra Search Console ze niet meer toont.
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export async function GET(): Promise<Response> {
  const aan = await alleenFlexwerkAan().catch(() => false);
  const vandaag = new Date().toISOString().slice(0, 10);
  const regels = aan ? verwijderdePaden().map((p) => `  <url><loc>${esc(SITE.url + p)}</loc><lastmod>${vandaag}</lastmod></url>`) : [];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${regels.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
