import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createContentSchema = z.object({
  typeId: z.string(),
  title: z.string(),
  slug: z.string(),
  data: z.record(z.any()),
  locale: z.string().default('nl'),
});

const querySchema = z.object({
  typeId: z.string().optional(),
  locale: z.string().optional(),
  state: z.enum(['draft', 'review', 'published', 'archived']).optional(),
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const params = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    // Fetch from DB based on filters
    const contents = [];

    return NextResponse.json({ contents, total: 0 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = createContentSchema.parse(body);

    const content = {
      id: `content_${Date.now()}`,
      ...data,
      state: 'draft' as const,
      version: 1,
      createdBy: principal.userId,
      updatedBy: principal.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return NextResponse.json(content, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const contentId = request.nextUrl.searchParams.get('id');

    if (!contentId) {
      throw AppError.validation('Content ID required');
    }

    const body = await request.json();
    const updates = createContentSchema.partial().parse(body);

    const updated = {
      id: contentId,
      ...updates,
      updatedBy: principal.userId,
      updatedAt: new Date(),
    };

    return NextResponse.json(updated);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const contentId = request.nextUrl.searchParams.get('id');

    if (!contentId) {
      throw AppError.validation('Content ID required');
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
