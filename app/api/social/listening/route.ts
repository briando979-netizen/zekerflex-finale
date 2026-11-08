import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { trackMentions, detectTrends } from '@/lib/social/listening';
import { z } from 'zod';

const listenSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'twitter', 'linkedin']),
  keyword: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { platform, keyword } = listenSchema.parse(body);

    const mentions = await trackMentions(principal.tenantId, platform, keyword);

    return NextResponse.json({ mentions }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to track mentions' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') as any;

    const trends = await detectTrends(principal.tenantId, platform);

    return NextResponse.json({ trends });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to detect trends' }, { status: 400 });
  }
}
