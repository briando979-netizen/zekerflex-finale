import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError, toErrorBody } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const galleryQuerySchema = z.object({
  type: z.enum(['image', 'video', 'audio']).optional(),
  tags: z.string().optional(),
  collections: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const query = galleryQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    const where: any = { galleryId: principal.tenantId };

    if (query.type) where.type = query.type;
    if (query.tags) where.tags = { hasSome: query.tags.split(',') };
    if (query.collections) where.collections = { hasSome: query.collections.split(',') };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.galleryItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.galleryItem.count({ where }),
    ]);

    return NextResponse.json({
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const createGalleryItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  url: z.string().url(),
  type: z.enum(['image', 'video', 'audio']),
  mimeType: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
  size: z.number().int().positive(),
  tags: z.array(z.string()).default([]),
  collections: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const item = createGalleryItemSchema.parse(body);

    const created = await prisma.galleryItem.create({
      data: {
        galleryId: principal.tenantId,
        ...item,
        viewCount: 0,
      },
    });

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const itemId = request.nextUrl.searchParams.get('id');

    if (!itemId) {
      throw AppError.validation('Item ID required');
    }

    const item = await prisma.galleryItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw AppError.notFound('Item not found');
    }

    if (item.galleryId !== principal.tenantId) {
      throw AppError.forbidden('Not your item');
    }

    await prisma.galleryItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
