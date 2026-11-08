type SEOConfig = {
  lang: string;
  hreflangs: Array<{ lang: string; url: string }>;
  canonical: string;
  ogLocale: string;
};

export function generateHreflangTags(
  baseUrl: string,
  langs: string[],
  path: string
): string {
  return langs
    .map(lang => `<link rel="alternate" hreflang="${lang}" href="${baseUrl}/${lang}${path}" />`)
    .join("\n");
}

export function generateSitemapLanguages(baseUrl: string, langs: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${langs
  .map(
    lang => `  <url>
    <loc>${baseUrl}/${lang}/</loc>
    <xhtml:link rel="alternate" hreflang="${lang}" href="${baseUrl}/${lang}/" />
  </url>`
  )
  .join("\n")}
</urlset>`;
}

export function getOpenGraphLocale(lang: string): string {
  const localeMap: Record<string, string> = {
    nl: "nl_NL",
    en: "en_GB",
    pl: "pl_PL",
    ro: "ro_RO",
    uk: "uk_UA",
    de: "de_DE",
    fr: "fr_FR",
    es: "es_ES",
    it: "it_IT",
  };
  return localeMap[lang] || "en_US";
}
