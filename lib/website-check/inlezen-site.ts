import { logger } from "@/lib/logger";
import { googleVoorWebsite } from "@/lib/review-scan/places";
import { fetchPage } from "@/lib/website-check/fetch";
import { kiesSubpaginas, leesOpeningstijden, voegSamen, type GelezenPagina, type RijkeFeiten } from "@/lib/website-check/inlezen";

// ---------------------------------------------------------------------------
// De hele website van een bedrijf lezen voor een nieuwe site (gratis check en
// websitevoorstellen van sales): de homepage plus hooguit 6 subpagina's, elk
// via de SSRF-veilige fetcher (lib/website-check/fetch.ts), tegelijk en met een
// korte tijdslimiet. Daarna Google erbij (score, openingstijden), alleen als
// het profiel naar deze website wijst. Mislukt een pagina, dan zonder die pagina.
// ---------------------------------------------------------------------------

const MAX_SUBPAGINAS = 6;

export async function leesHeleSite(home: { body: string; finalUrl: string }, opts: { google?: boolean } = {}): Promise<RijkeFeiten> {
  const subs = kiesSubpaginas(home.body, home.finalUrl, MAX_SUBPAGINAS);
  const gelezen = await Promise.all(
    subs.map(async (s): Promise<GelezenPagina | null> => {
      try {
        const p = await fetchPage(s.url, { timeoutMs: 8_000, maxRedirects: 3 });
        const soort = p.headers["content-type"] ?? "";
        if (p.status >= 400 || (soort && !/html/i.test(soort))) return null;
        return { url: p.finalUrl, soort: s.soort, html: p.body };
      } catch {
        return null;
      }
    }),
  );
  const paginas: GelezenPagina[] = [{ url: home.finalUrl, soort: "home", html: home.body }, ...gelezen.filter((p): p is GelezenPagina => p !== null)];
  const rijk = voegSamen(paginas);
  if (opts.google !== false) {
    const g = await googleVoorWebsite(rijk.naam, rijk.plaats, new URL(home.finalUrl).hostname).catch((err: Error) => {
      logger.info("website inlezen zonder google", { reden: err.message.slice(0, 120) });
      return null;
    });
    if (g) {
      if (g.rating !== null && g.aantal > 0) rijk.google = { rating: g.rating, aantal: g.aantal, mapsUrl: g.mapsUrl };
      if (!rijk.uren.length && g.uren.length) rijk.uren = leesOpeningstijden(g.uren.join("\n"));
      if (!rijk.telefoon && g.telefoon) rijk.telefoon = g.telefoon.replace(/[^\d+]/g, "");
      rijk.openingstijden = rijk.openingstijden || rijk.uren.length > 0;
    }
  }
  logger.info("website ingelezen", {
    paginas: paginas.length,
    diensten: rijk.secties.length,
    fotos: rijk.fotos.length,
    uren: rijk.uren.length,
    faq: rijk.faq.length,
    getuigenissen: rijk.getuigenissen.length,
    google: Boolean(rijk.google),
  });
  return rijk;
}
