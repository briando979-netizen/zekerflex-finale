/**
 * Dynamische sitemap-builder voor 105 landingspagina's.
 * Genereert XML sitemaps met lastmod, priority, changefreq.
 */

import { getAllLandingPagePairs, getSectorForPage, getCityForPage } from './landing-generator';

export interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

/**
 * Genereer alle sitemap entries voor sector × stad combinaties.
 */
export function generateLandingSitemapEntries(
  baseUrl: string = 'https://zekerflex.com'
): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const pairs = getAllLandingPagePairs();

  const now = new Date().toISOString().split('T')[0];

  for (const pair of pairs) {
    const sector = getSectorForPage(pair.sector);
    const city = getCityForPage(pair.city);

    if (!sector || !city) continue;

    // Werkgever-pagina
    entries.push({
      loc: `${baseUrl}/werkgever/${sector.slug}/${city.slug}`,
      lastmod: now,
      changefreq: 'weekly',
      priority: 0.8,
    });

    // Werker-pagina
    entries.push({
      loc: `${baseUrl}/${sector.workerSlug}/${city.slug}`,
      lastmod: now,
      changefreq: 'weekly',
      priority: 0.8,
    });
  }

  return entries;
}

/**
 * Genereer hub/index pagina's voor sitemap.
 */
export function generateHubSitemapEntries(
  baseUrl: string = 'https://zekerflex.com'
): SitemapEntry[] {
  const now = new Date().toISOString().split('T')[0];

  return [
    {
      loc: `${baseUrl}/`,
      lastmod: now,
      changefreq: 'weekly',
      priority: 1.0,
    },
    {
      loc: `${baseUrl}/werkgever`,
      lastmod: now,
      changefreq: 'weekly',
      priority: 0.9,
    },
    {
      loc: `${baseUrl}/vacatures`,
      lastmod: now,
      changefreq: 'daily',
      priority: 0.9,
    },
    {
      loc: `${baseUrl}/aanbod`,
      lastmod: now,
      changefreq: 'weekly',
      priority: 0.7,
    },
  ];
}

/**
 * Genereer XML sitemap string uit entries.
 */
export function entriesToXmlSitemap(entries: SitemapEntry[]): string {
  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const urlsXml = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;
}

/**
 * Genereer sitemap index (wanneer meer dan 50.000 URLs).
 */
export function generateSitemapIndex(
  sitemapUrls: string[]
): string {
  const now = new Date().toISOString().split('T')[0];

  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const sitemapsXml = sitemapUrls
    .map(
      (url) => `  <sitemap>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapsXml}
</sitemapindex>`;
}

/**
 * Splits entries in chunks voor multiple sitemaps (Google limiet: 50.000 URLs).
 */
export function chunkSitemapEntries(
  entries: SitemapEntry[],
  chunkSize: number = 50000
): SitemapEntry[][] {
  const chunks: SitemapEntry[][] = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Genereeer prioriteits-formule op basis van pagina-type.
 */
export function calculateSitemapPriority(
  pageType: 'employer' | 'worker' | 'hub' | 'sector' | 'city'
): number {
  switch (pageType) {
    case 'hub':
      return 1.0;
    case 'sector':
    case 'city':
      return 0.9;
    case 'employer':
    case 'worker':
      return 0.8;
    default:
      return 0.5;
  }
}

/**
 * Genereer robots.txt met sitemap verwijzingen.
 */
export function generateRobotsTxt(
  baseUrl: string = 'https://zekerflex.com',
  additionalDisallows: string[] = []
): string {
  let content = `# ZekerFlex robots.txt
# Gegenereerd op ${new Date().toISOString()}

User-agent: *
Allow: /

`;

  // Standaard disallows
  const disallows = [
    '/admin/',
    '/api/',
    '/dashboard/',
    '/werkgever-dashboard/',
    '/*.json',
    '/tmp/',
    '/_next/',
    '/static/',
    ...additionalDisallows,
  ];

  for (const disallow of disallows) {
    content += `Disallow: ${disallow}\n`;
  }

  content += `
# Sitemap reference
Sitemap: ${baseUrl}/sitemap.xml
Sitemap: ${baseUrl}/sitemap-landing.xml

# Crawl delay (optional)
# Crawl-delay: 2

# Request rate limit (optional)
# Request-rate: 30/60
`;

  return content;
}

/**
 * Controleer sitemap validity (alle URLs moeten volledige URLs zijn).
 */
export function validateSitemapEntries(entries: SitemapEntry[]): string[] {
  const errors: string[] = [];

  for (const entry of entries) {
    // Check of URL absoluut is
    if (!entry.loc.startsWith('http://') && !entry.loc.startsWith('https://')) {
      errors.push(`Relative URL detected: ${entry.loc}`);
    }

    // Check lastmod format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) {
      errors.push(`Invalid lastmod format: ${entry.lastmod}`);
    }

    // Check priority range
    if (entry.priority < 0 || entry.priority > 1) {
      errors.push(`Priority out of range (0-1): ${entry.priority} for ${entry.loc}`);
    }
  }

  return errors;
}

/**
 * Genereer sitemap rapport.
 */
export function generateSitemapReport(entries: SitemapEntry[]): {
  totalUrls: number;
  byChangefreq: Record<string, number>;
  priorityDistribution: Record<string, number>;
  sizeBytes: number;
} {
  const byChangefreq = {
    always: 0,
    hourly: 0,
    daily: 0,
    weekly: 0,
    monthly: 0,
    yearly: 0,
    never: 0,
  };

  const priorityDistribution: Record<string, number> = {};

  for (const entry of entries) {
    byChangefreq[entry.changefreq]++;
    const priorityKey = entry.priority.toFixed(1);
    priorityDistribution[priorityKey] = (priorityDistribution[priorityKey] ?? 0) + 1;
  }

  // Geschatte XML-grootte
  const avgUrlSize = 200; // bytes
  const xmlOverhead = 500; // bytes
  const sizeBytes = entries.length * avgUrlSize + xmlOverhead;

  return {
    totalUrls: entries.length,
    byChangefreq: byChangefreq as Record<string, number>,
    priorityDistribution,
    sizeBytes,
  };
}
