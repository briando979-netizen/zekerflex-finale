/**
 * Tests voor SEO Organic Growth Engine
 * - Landing page generator
 * - Meta tags
 * - JSON-LD
 * - Internal linking
 * - Analytics
 * - Sitemap builder
 */

import { describe, it, expect } from 'vitest';
import {
  generateAllLandingConfigs,
  getLandingConfig,
  generateEmployerPageTitle,
  generateEmployerPageDescription,
  generateWorkerPageTitle,
  generateWorkerPageDescription,
  getAllLandingPagePairs,
  isValidLandingPage,
  getSectorForPage,
  getCityForPage,
} from '@/lib/seo/landing-generator';
import {
  generateEmployerMetaTags,
  generateWorkerMetaTags,
  metaTagsToHTML,
  generateStructuredMetadata,
} from '@/lib/seo/meta-tags';
import {
  generateEmployerBreadcrumbs,
  generateWorkerBreadcrumbs,
  generateRelatedCityLinksEmployer,
  generateRelatedCityLinksWorker,
  generateRelatedSectorLinksEmployer,
  generateRelatedSectorLinksWorker,
  breadcrumbsToJsonLd,
} from '@/lib/seo/internal-linking';
import {
  determinePerformanceLevel,
  calculateBounceRate,
  calculateConversionRate,
  identifyUnderperformers,
  identifyOverperformers,
  generateSeoHealthScore,
} from '@/lib/seo/analytics';
import {
  generateLandingSitemapEntries,
  generateHubSitemapEntries,
  entriesToXmlSitemap,
  validateSitemapEntries,
  generateRobotsTxt,
} from '@/lib/seo/sitemap-builder';

describe('SEO Landing Generator', () => {
  it('Should generate all 105 landing configs', () => {
    const configs = generateAllLandingConfigs();
    expect(configs).toHaveLength(105); // 5 sectors × 21 cities
  });

  it('Should get specific landing config', () => {
    const config = getLandingConfig('horeca-personeel-inhuren', 'amsterdam');
    expect(config).toBeDefined();
    expect(config?.sectorLabel).toBe('Horeca');
    expect(config?.cityName).toBe('Amsterdam');
  });

  it('Should return null for invalid config', () => {
    const config = getLandingConfig('invalid-sector', 'invalid-city');
    expect(config).toBeNull();
  });

  it('Should validate landing pages', () => {
    expect(isValidLandingPage('horeca-personeel-inhuren', 'amsterdam')).toBe(true);
    expect(isValidLandingPage('invalid', 'invalid')).toBe(false);
  });

  it('Should generate employer page titles', () => {
    const title = generateEmployerPageTitle('Horeca', 'Amsterdam');
    expect(title).toContain('Horeca');
    expect(title).toContain('Amsterdam');
    expect(title).toContain('ZekerFlex');
  });

  it('Should generate worker page titles', () => {
    const title = generateWorkerPageTitle('Horeca', 'Amsterdam');
    expect(title).toContain('Horeca');
    expect(title).toContain('Amsterdam');
    expect(title).toContain('vacatures');
  });

  it('Should generate all page pairs', () => {
    const pairs = getAllLandingPagePairs();
    expect(pairs.length).toBe(105);
    expect(pairs[0]).toHaveProperty('sector');
    expect(pairs[0]).toHaveProperty('city');
  });
});

describe('SEO Meta Tags', () => {
  it('Should generate employer meta tags', () => {
    const tags = generateEmployerMetaTags(
      'Horeca',
      'Amsterdam',
      'bedieners, koks, afwassers',
      'https://zekerflex.com'
    );

    expect(tags.title).toContain('Horeca');
    expect(tags.description).toContain('flexwerk');
    expect(tags.canonical).toBeDefined();
    expect(tags.ogTitle).toBeDefined();
  });

  it('Should generate worker meta tags', () => {
    const tags = generateWorkerMetaTags('Horeca', 'Amsterdam', 'https://zekerflex.com');

    expect(tags.title).toContain('vacatures');
    expect(tags.description).toContain('Amsterdam');
  });

  it('Should convert meta tags to HTML', () => {
    const tags = generateEmployerMetaTags(
      'Horeca',
      'Amsterdam',
      'staff',
      'https://zekerflex.com'
    );
    const html = metaTagsToHTML(tags);

    expect(html).toContain('<title>');
    expect(html).toContain('og:title');
    expect(html).toContain('twitter:card');
  });

  it('Should escape HTML in meta tags', () => {
    const tags = generateEmployerMetaTags(
      'Test & Demo',
      'City <script>',
      'roles',
      'https://zekerflex.com'
    );
    const html = metaTagsToHTML(tags);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;');
  });
});

describe('SEO Internal Linking', () => {
  it('Should generate employer breadcrumbs', () => {
    const crumbs = generateEmployerBreadcrumbs('Horeca', 'Amsterdam');

    expect(crumbs.length).toBe(4);
    expect(crumbs[0].label).toBe('ZekerFlex');
    expect(crumbs[crumbs.length - 1].label).toBe('Amsterdam');
  });

  it('Should generate worker breadcrumbs', () => {
    const crumbs = generateWorkerBreadcrumbs('Horeca', 'Amsterdam', 'horeca-personeel-inhuren');

    expect(crumbs.length).toBe(4);
    expect(crumbs[0].label).toBe('ZekerFlex');
  });

  it('Should generate related city links for employer', () => {
    const links = generateRelatedCityLinksEmployer('amsterdam', 'horeca-personeel-inhuren', 3);

    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(3);
    expect(links[0]).toHaveProperty('href');
    expect(links[0]).toHaveProperty('text');
    expect(links[0]).toHaveProperty('priority');
  });

  it('Should generate related sector links for employer', () => {
    const links = generateRelatedSectorLinksEmployer('horeca-personeel-inhuren', 'amsterdam', 2);

    expect(links.length).toBeLessThanOrEqual(2);
    expect(links[0].text).toContain('personeel');
  });

  it('Should convert breadcrumbs to JSON-LD', () => {
    const crumbs = generateEmployerBreadcrumbs('Horeca', 'Amsterdam');
    const schema = breadcrumbsToJsonLd(crumbs);

    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toBeDefined();
  });
});

describe('SEO Analytics', () => {
  it('Should determine performance level', () => {
    expect(determinePerformanceLevel(100, 5)).toBe('good'); // 5% conversion
    expect(determinePerformanceLevel(100, 1)).toBe('average'); // 1% conversion
    expect(determinePerformanceLevel(10, 0)).toBe('poor'); // 0% conversion
  });

  it('Should calculate bounce rate', () => {
    expect(calculateBounceRate(100, 30)).toBe(30);
    expect(calculateBounceRate(0, 0)).toBe(0);
  });

  it('Should calculate conversion rate', () => {
    const rate = calculateConversionRate(100, 3);
    expect(rate).toBe(3);

    const zeroRate = calculateConversionRate(100, 0);
    expect(zeroRate).toBe(0);
  });

  it('Should identify underperformers', () => {
    const data = [
      {
        sector: 'horeca',
        city: 'amsterdam',
        employerViews: 100,
        workerViews: 50,
        employerConversions: 0,
        workerConversions: 0,
        totalViews: 150,
        totalConversions: 0,
        performance: 'poor' as const,
      },
      {
        sector: 'logistiek',
        city: 'rotterdam',
        employerViews: 50,
        workerViews: 25,
        employerConversions: 2,
        workerConversions: 1,
        totalViews: 75,
        totalConversions: 3,
        performance: 'good' as const,
      },
    ];

    const underperformers = identifyUnderperformers(data);
    expect(underperformers.length).toBeGreaterThan(0);
  });

  it('Should generate SEO health score', () => {
    const data = [
      {
        sector: 'horeca',
        city: 'amsterdam',
        employerViews: 100,
        workerViews: 50,
        employerConversions: 3,
        workerConversions: 1,
        totalViews: 150,
        totalConversions: 4,
        performance: 'good' as const,
      },
    ];

    const score = generateSeoHealthScore(data);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('SEO Sitemap Builder', () => {
  it('Should generate landing sitemap entries', () => {
    const entries = generateLandingSitemapEntries('https://zekerflex.com');

    expect(entries.length).toBeGreaterThan(100); // 105 pages × 2 (employer + worker)
    expect(entries[0]).toHaveProperty('loc');
    expect(entries[0]).toHaveProperty('lastmod');
    expect(entries[0]).toHaveProperty('priority');
  });

  it('Should generate hub sitemap entries', () => {
    const entries = generateHubSitemapEntries('https://zekerflex.com');

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].loc).toContain('https://zekerflex.com');
  });

  it('Should convert entries to XML sitemap', () => {
    const entries = [
      {
        loc: 'https://zekerflex.com/',
        lastmod: '2026-11-08',
        changefreq: 'weekly' as const,
        priority: 1.0,
      },
    ];

    const xml = entriesToXmlSitemap(entries);

    expect(xml).toContain('<?xml');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('https://zekerflex.com/');
    expect(xml).toContain('2026-11-08');
  });

  it('Should validate sitemap entries', () => {
    const validEntries = [
      {
        loc: 'https://zekerflex.com/',
        lastmod: '2026-11-08',
        changefreq: 'weekly' as const,
        priority: 0.8,
      },
    ];

    const errors = validateSitemapEntries(validEntries);
    expect(errors.length).toBe(0);
  });

  it('Should detect invalid sitemap entries', () => {
    const invalidEntries = [
      {
        loc: '/relative/url', // Relative URL
        lastmod: '2026-11-08',
        changefreq: 'weekly' as const,
        priority: 0.8,
      },
      {
        loc: 'https://zekerflex.com/',
        lastmod: 'invalid-date', // Invalid date format
        changefreq: 'weekly' as const,
        priority: 0.8,
      },
    ];

    const errors = validateSitemapEntries(invalidEntries);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('Should generate robots.txt', () => {
    const robotsTxt = generateRobotsTxt('https://zekerflex.com');

    expect(robotsTxt).toContain('User-agent: *');
    expect(robotsTxt).toContain('Disallow: /admin/');
    expect(robotsTxt).toContain('Sitemap:');
  });
});
