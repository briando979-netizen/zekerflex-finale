import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const SearchSchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const UpdateSchema = z.object({
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  suspended: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole('PLATFORM_ADMIN');

    const { q, limit, offset } = SearchSchema.parse({
      q: request.nextUrl.searchParams.get('q'),
      limit: request.nextUrl.searchParams.get('limit'),
      offset: request.nextUrl.searchParams.get('offset'),
    });

    const where = q ? {
      OR: [
        { email: { contains: q, mode: 'insensitive' as const } },
        { displayName: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          avatar: true,
          createdAt: true,
          suspended: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, limit, offset });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole('PLATFORM_ADMIN');

    const userId = request.nextUrl.searchParams.get('id');
    if (!userId) throw AppError.validation('User ID required');

    const body = await request.json();
    const updates = UpdateSchema.parse(body);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: { id: true, email: true, displayName: true, suspended: true },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireRole('PLATFORM_ADMIN');

    const userId = request.nextUrl.searchParams.get('id');
    if (!userId) throw AppError.validation('User ID required');

    await prisma.user.update({
      where: { id: userId },
      data: { suspended: true },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
