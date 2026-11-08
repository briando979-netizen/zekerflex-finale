/**
 * SEO Meta Tags generator voor landingspagina's.
 * Titles, descriptions, canonicals, Open Graph, Twitter kaarten.
 */

export interface MetaTagsConfig {
  title: string;
  description: string;
  canonical: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  twitterCard?: 'summary' | 'summary_large_image';
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

/**
 * Genereer meta tags object voor werkgever-landingspagina.
 */
export function generateEmployerMetaTags(
  sectorLabel: string,
  cityName: string,
  roles: string,
  baseUrl: string
): MetaTagsConfig {
  const title = `${sectorLabel} personeel inhuren in ${cityName}`;
  const description = `Flexwerk personeel inhuren in ${cityName}. ${roles}. Snel, flexibel en betrouwbaar via ZekerFlex.`;
  const canonical = `${baseUrl}/werkgever/${sectorLabel.toLowerCase().replace(/\s+/g, '-')}/${cityName.toLowerCase().replace(/\s+/g, '-')}`;

  return {
    title: `${title} | ZekerFlex`,
    description: description.slice(0, 160),
    canonical,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/og-employer-${sectorLabel.toLowerCase()}.jpg`,
    ogType: 'website',
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: `${baseUrl}/og-employer-${sectorLabel.toLowerCase()}.jpg`,
  };
}

/**
 * Genereer meta tags object voor werker-landingspagina.
 */
export function generateWorkerMetaTags(
  sectorLabel: string,
  cityName: string,
  baseUrl: string
): MetaTagsConfig {
  const title = `${sectorLabel} vacatures in ${cityName}`;
  const description = `Vind ${sectorLabel.toLowerCase()} werk in ${cityName}. Dagwerk, avondwerk, weekendwerk. Direct beschikbaar.`;
  const canonical = `${baseUrl}/${sectorLabel.toLowerCase().replace(/\s+/g, '-')}-vacatures/${cityName.toLowerCase().replace(/\s+/g, '-')}`;

  return {
    title: `${title} | ZekerFlex`,
    description: description.slice(0, 160),
    canonical,
    ogTitle: title,
    ogDescription: description,
    ogImage: `${baseUrl}/og-worker-${sectorLabel.toLowerCase()}.jpg`,
    ogType: 'website',
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: `${baseUrl}/og-worker-${sectorLabel.toLowerCase()}.jpg`,
  };
}

/**
 * Converteer meta tags config naar meta tag HTML strings.
 */
export function metaTagsToHTML(config: MetaTagsConfig): string[] {
  const tags: string[] = [];

  tags.push(`<title>${escapeHtml(config.title)}</title>`);
  tags.push(
    `<meta name="description" content="${escapeHtml(config.description)}" />`
  );
  tags.push(`<link rel="canonical" href="${escapeHtml(config.canonical)}" />`);

  if (config.ogTitle) {
    tags.push(
      `<meta property="og:title" content="${escapeHtml(config.ogTitle)}" />`
    );
  }
  if (config.ogDescription) {
    tags.push(
      `<meta property="og:description" content="${escapeHtml(config.ogDescription)}" />`
    );
  }
  if (config.ogImage) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(config.ogImage)}" />`
    );
  }
  if (config.ogType) {
    tags.push(`<meta property="og:type" content="${config.ogType}" />`);
  }

  if (config.twitterCard) {
    tags.push(`<meta name="twitter:card" content="${config.twitterCard}" />`);
  }
  if (config.twitterTitle) {
    tags.push(
      `<meta name="twitter:title" content="${escapeHtml(config.twitterTitle)}" />`
    );
  }
  if (config.twitterDescription) {
    tags.push(
      `<meta name="twitter:description" content="${escapeHtml(config.twitterDescription)}" />`
    );
  }
  if (config.twitterImage) {
    tags.push(
      `<meta name="twitter:image" content="${escapeHtml(config.twitterImage)}" />`
    );
  }

  return tags;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]!);
}

/**
 * Genereer gestructureerde metadata voor een pagina.
 */
export function generateStructuredMetadata(
  sectorLabel: string,
  cityName: string,
  isFrontPage: boolean = false
): Record<string, unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zekerflex.com';

  return {
    '@context': 'https://schema.org',
    '@type': 'SearchResultsPage',
    name: `${sectorLabel} in ${cityName}`,
    description: `Vind ${sectorLabel.toLowerCase()} flexwerk in ${cityName}`,
    url: `${baseUrl}/${sectorLabel.toLowerCase()}/${cityName.toLowerCase()}`,
    datePublished: new Date().toISOString(),
    dateModified: new Date().toISOString(),
  };
}
