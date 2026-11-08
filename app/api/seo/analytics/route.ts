/**
 * API endpoint voor SEO analytics.
 * GET /api/seo/analytics - Haal analytics data op per sector/stad
 * POST /api/seo/analytics - Log page views en conversions
 *
 * Administratief endpoint (eigenaar + analytics readers).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateSectorReport,
  generateCityReport,
  identifyUnderperformers,
  identifyOverperformers,
  generateRecommendations,
  generateSeoHealthScore,
} from '@/lib/seo/analytics';

export const runtime = 'nodejs';

/**
 * GET: Fetch analytics dashboard data.
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const period = searchParams.get('period') || '7d'; // 7d, 30d, 90d
  const sector = searchParams.get('sector');
  const city = searchParams.get('city');

  try {
    // Placeholder: echte data zou van database/KV come
    const mockData = generateMockAnalyticsData();

    let data = mockData;

    if (sector) {
      data = data.filter((d) => d.sector === sector);
    }
    if (city) {
      data = data.filter((d) => d.city === city);
    }

    // Calculeer insights
    const underperformers = identifyUnderperformers(data);
    const overperformers = identifyOverperformers(data);
    const recommendations = generateRecommendations(data);
    const healthScore = generateSeoHealthScore(data);

    return NextResponse.json(
      {
        period,
        data,
        insights: {
          healthScore,
          underperformers: underperformers.length,
          overperformers: overperformers.length,
          recommendations,
        },
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[SEO Analytics] GET error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST: Track page view or conversion event.
 */
export async function POST(req: NextRequest) {
  // Client endpoint: minder strenge auth
  const sessionId = req.headers.get('x-session-id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { sectorSlug, citySlug, pageType, eventType } = body;

    if (!sectorSlug || !citySlug || !pageType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Valideer enums
    if (!['employer', 'worker'].includes(pageType)) {
      return NextResponse.json(
        { error: 'Invalid pageType' },
        { status: 400 }
      );
    }

    // Placeholder: Opslaan naar database/KV
    // In production: await kv.incr(...) of prisma create

    console.log('[SEO Analytics] Tracked:', {
      sectorSlug,
      citySlug,
      pageType,
      eventType: eventType || 'pageview',
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Event tracked',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[SEO Analytics] POST error:', error);
    return NextResponse.json(
      {
        error: 'Failed to track event',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Mock analytics data voor demo.
 */
function generateMockAnalyticsData() {
  const sectors = ['horeca', 'logistiek', 'schoonmaak', 'evenementen', 'retail'];
  const cities = [
    'amsterdam',
    'rotterdam',
    'den-haag',
    'utrecht',
    'eindhoven',
    'groningen',
    'tilburg',
    'almere',
    'breda',
    'nijmegen',
  ];

  const data = [];

  for (const sector of sectors) {
    for (const city of cities) {
      const views = Math.floor(Math.random() * 500);
      const conversions = Math.floor(views * (Math.random() * 0.03));

      data.push({
        sector,
        city,
        employerViews: Math.floor(views * 0.6),
        workerViews: Math.floor(views * 0.4),
        employerConversions: Math.floor(conversions * 0.6),
        workerConversions: Math.floor(conversions * 0.4),
        totalViews: views,
        totalConversions: conversions,
        performance: ['excellent', 'good', 'average', 'poor'][
          Math.floor(Math.random() * 4)
        ] as 'excellent' | 'good' | 'average' | 'poor',
      });
    }
  }

  return data;
}
