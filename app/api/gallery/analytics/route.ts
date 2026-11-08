import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const analyticsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('month'),
  type: z.enum(['image', 'video', 'audio']).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const query = analyticsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const items = await prisma.galleryItem.findMany({
      where: {
        galleryId: principal.tenantId,
        ...(query.type && { type: query.type }),
      },
    });

    const now = new Date();
    const startDate = getStartDate(now, query.period);

    const stats = {
      totalItems: items.length,
      totalViews: items.reduce((sum, i) => sum + (i.viewCount ?? 0), 0),
      totalSize: items.reduce((sum, i) => sum + (i.size ?? 0), 0),
      byType: {
        image: items.filter((i) => i.type === 'image').length,
        video: items.filter((i) => i.type === 'video').length,
        audio: items.filter((i) => i.type === 'audio').length,
      },
      topItems: items
        .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
        .slice(0, 10)
        .map((i) => ({
          id: i.id,
          name: i.name,
          views: i.viewCount,
          type: i.type,
          size: i.size,
        })),
      qualityDistribution: {
        hd_4k: items.filter((i) => (i.width ?? 0) >= 3840).length,
        hd_1080p: items.filter((i) => (i.width ?? 0) >= 1920 && (i.width ?? 0) < 3840).length,
        hd_720p: items.filter((i) => (i.width ?? 0) >= 1280 && (i.width ?? 0) < 1920).length,
        standard: items.filter((i) => (i.width ?? 0) < 1280).length,
      },
      bandwidthUsage: {
        total: items.reduce((sum, i) => sum + (i.size ?? 0), 0),
        byType: {
          image: items
            .filter((i) => i.type === 'image')
            .reduce((sum, i) => sum + (i.size ?? 0), 0),
          video: items
            .filter((i) => i.type === 'video')
            .reduce((sum, i) => sum + (i.size ?? 0), 0),
          audio: items
            .filter((i) => i.type === 'audio')
            .reduce((sum, i) => sum + (i.size ?? 0), 0),
        },
      },
    };

    return NextResponse.json(stats);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

function getStartDate(now: Date, period: 'day' | 'week' | 'month'): Date {
  const date = new Date(now);
  switch (period) {
    case 'day':
      date.setDate(date.getDate() - 1);
      break;
    case 'week':
      date.setDate(date.getDate() - 7);
      break;
    case 'month':
      date.setMonth(date.getMonth() - 1);
      break;
  }
  return date;
}
