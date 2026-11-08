/**
 * API endpoint voor robots.txt.
 * GET /api/seo/robots - Genereer robots.txt
 *
 * Public endpoint (door search engines aanroepen).
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateRobotsTxt } from '@/lib/seo/sitemap-builder';

export const runtime = 'nodejs';

// Cache robots.txt voor 7 dagen
export const revalidate = 604800;

/**
 * GET: Genereer robots.txt
 */
export async function GET(req: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zekerflex.com';

    const robotsTxt = generateRobotsTxt(baseUrl);

    return new NextResponse(robotsTxt, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=604800',
      },
    });
  } catch (error) {
    console.error('[SEO] Robots.txt generation error:', error);
    return new NextResponse('User-agent: *\nDisallow: /\n', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
