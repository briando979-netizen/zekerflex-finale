/**
 * API endpoint voor het genereren/vernieuwen van 105 landingspagina's.
 * POST /api/seo/generate-pages
 *
 * Administratief endpoint (eigenaar only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAllLandingConfigs } from '@/lib/seo/landing-generator';

export const runtime = 'nodejs';

/**
 * POST: Genereer alle landingspagina configs.
 */
export async function POST(req: NextRequest) {
  // Security check: eigenaar only
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const configs = generateAllLandingConfigs();

    // Statistieken
    const stats = {
      totalPages: configs.length,
      sectors: new Set(configs.map((c) => c.sectorSlug)).size,
      cities: new Set(configs.map((c) => c.citySlug)).size,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(
      {
        success: true,
        message: `${configs.length} landingspagina configs gegenereerd`,
        stats,
        sample: configs.slice(0, 3),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[SEO] Generate pages error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate pages',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Status van gegenereerde pages.
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const configs = generateAllLandingConfigs();

    return NextResponse.json(
      {
        status: 'operational',
        totalConfigs: configs.length,
        sectors: new Set(configs.map((c) => c.sectorSlug)).size,
        cities: new Set(configs.map((c) => c.citySlug)).size,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[SEO] Status check error:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
