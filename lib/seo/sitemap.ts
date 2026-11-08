export interface SitemapURL {
  loc: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number; // 0.0 - 1.0
}

export const generateSitemap = (urls: SitemapURL[]): string => {
  const urlEntries = urls.map(url => `
  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
};

export const generateSitemapIndex = (sitemaps: string[]): string => {
  const sitemapEntries = sitemaps.map(url => `
  <sitemap>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</sitemapindex>`;
};

export const generateRobotsTxt = (rules: RobotRule[]): string => {
  let content = '# ZekerFlex robots.txt\n';
  content += `User-agent: *\n`;
  content += `Allow: /\n`;
  content += `Disallow: /admin/\n`;
  content += `Disallow: /api/\n`;
  content += `Disallow: /*.json\n`;
  content += `Disallow: /tmp/\n\n`;
  content += `Sitemap: https://zekerflex.com/sitemap.xml\n`;
  return content;
};

export interface RobotRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

export const generateCanonicalTag = (url: string): string => {
  return `<link rel="canonical" href="${escapeXml(url)}" />`;
};

export const generateStructuredData = (type: string, data: Record<string, any>): string => {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': type,
    ...data,
  };
  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
};

export const generateHreflangTags = (urls: Record<string, string>): string => {
  return Object.entries(urls)
    .map(([lang, url]) => `<link rel="alternate" hreflang="${lang}" href="${escapeXml(url)}" />`)
    .join('\n');
};

const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

export const optimizeRobotsTxt = (): string => {
  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /tmp/
Disallow: /?ref=
Disallow: /?utm_

User-agent: *
Crawl-delay: 1

Sitemap: https://zekerflex.com/sitemap.xml
Sitemap: https://zekerflex.com/sitemap-news.xml
Host: https://zekerflex.com`;
};
