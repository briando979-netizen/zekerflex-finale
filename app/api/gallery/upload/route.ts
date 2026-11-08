import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { AppError, toErrorBody } from '@/lib/errors';
import { createUploadSession, uploadChunk, finalizeUpload, prepareHDMediaForWhatsApp } from '@/lib/whatsapp/hd-media';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const initiateSchema = z.object({
  mediaType: z.enum(['image', 'video']),
  totalSize: z.number().int().positive(),
  mimeType: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
});

const uploadChunkSchema = z.object({
  sessionId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  chunkSize: z.number().int().positive(),
});

const finalizeSchema = z.object({
  sessionId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  collections: z.array(z.string()).default([]),
  targetResolution: z.enum(['720p', '1080p', '4k']).default('1080p'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'initiate') {
      return handleInitiate(principal, body);
    } else if (action === 'finalize') {
      return handleFinalize(principal, body);
    } else {
      throw AppError.validation('Invalid action');
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const { sessionId, chunkIndex } = uploadChunkSchema.parse({
      sessionId: body.sessionId,
      chunkIndex: body.chunkIndex,
      chunkSize: body.chunkSize,
    });

    const chunkData = Buffer.from(body.chunk, 'base64');
    const progress = uploadChunk(sessionId, chunkIndex, chunkData);

    return NextResponse.json(progress);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

async function handleInitiate(principal: any, body: any): Promise<NextResponse> {
  const data = initiateSchema.parse(body);
  const session = createUploadSession(data.mediaType, data.totalSize);

  return NextResponse.json({
    sessionId: session.sessionId,
    chunkSize: session.chunkSize,
    totalChunks: session.totalChunks,
  });
}

async function handleFinalize(principal: any, body: any): Promise<NextResponse> {
  const data = finalizeSchema.parse(body);

  const buffer = finalizeUpload(data.sessionId);

  // Prepare HD media
  const prepared = await prepareHDMediaForWhatsApp(buffer, 'image', {
    targetResolution: data.targetResolution,
    quality: 'high',
  });

  // Store in database
  const item = await prisma.galleryItem.create({
    data: {
      galleryId: principal.tenantId,
      name: data.name,
      description: data.description,
      url: `gallery://${data.sessionId}`, // Placeholder URL
      type: 'image',
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      size: prepared.size,
      tags: data.tags,
      collections: data.collections,
      viewCount: 0,
    },
  });

  return NextResponse.json({
    item,
    prepared: {
      mimeType: prepared.mimeType,
      size: prepared.size,
      width: prepared.width,
      height: prepared.height,
    },
  });
}
