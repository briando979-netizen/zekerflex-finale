/**
 * API endpoint voor dynamische sitemap generatie.
 * GET /api/seo/sitemap - Genereer XML sitemap
 *
 * Public endpoint (door search engines aanroepen).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateLandingSitemapEntries,
  generateHubSitemapEntries,
  entriesToXmlSitemap,
  generateRobotsTxt,
  validateSitemapEntries,
} from '@/lib/seo/sitemap-builder';

export const runtime = 'nodejs';

// Cache sitemap generatie voor 24 uur
export const revalidate = 86400;

/**
 * GET: Genereer XML sitemap.
 * Query params:
 *   - type: 'landing' (default) | 'hub' | 'all'
 *   - format: 'xml' (default) | 'json'
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get('type') || 'all';
  const format = searchParams.get('format') || 'xml';

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zekerflex.com';

    let entries = [];

    if (type === 'landing' || type === 'all') {
      entries.push(...generateLandingSitemapEntries(baseUrl));
    }

    if (type === 'hub' || type === 'all') {
      entries.push(...generateHubSitemapEntries(baseUrl));
    }

    // Valideer entries
    const errors = validateSitemapEntries(entries);
    if (errors.length > 0) {
      console.error('[SEO] Sitemap validation errors:', errors);
      return NextResponse.json(
        {
          error: 'Sitemap validation failed',
          errors: errors.slice(0, 10),
        },
        { status: 500 }
      );
    }

    if (format === 'json') {
      return NextResponse.json(
        {
          type,
          count: entries.length,
          entries: entries.slice(0, 100), // Beperk output
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=86400',
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // XML format (default)
    const xmlSitemap = entriesToXmlSitemap(entries);

    return new NextResponse(xmlSitemap, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('[SEO] Sitemap generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate sitemap',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
