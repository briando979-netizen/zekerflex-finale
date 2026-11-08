import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { createPost, publishPost, suggestBestTime } from '@/lib/social/posting';
import { z } from 'zod';

const postSchema = z.object({
  content: z.string().min(1),
  mediaUrls: z.array(z.string().url()).optional(),
  platforms: z.array(z.enum(['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'])),
  scheduledAt: z.string().datetime().optional(),
  hashtags: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { content, mediaUrls, platforms, scheduledAt, hashtags } = postSchema.parse(body);

    const suggestedTime = scheduledAt ? new Date(scheduledAt) : await suggestBestTime(platforms);

    const post = await createPost(
      principal.tenantId,
      content,
      mediaUrls || [],
      platforms,
      suggestedTime,
      hashtags || []
    );

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create post' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'draft';

    const posts = await prisma.socialPost.findMany({
      where: { tenantId: principal.tenantId, status: status as any },
      orderBy: { scheduledAt: 'desc' },
    });

    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 400 });
  }
}
