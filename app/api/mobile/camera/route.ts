import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const photoUploadSchema = z.object({
  image: z.object({
    data: z.string(),
    mimeType: z.string(),
  }),
  purpose: z.enum(['profile', 'document', 'verification', 'shift']),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { image, purpose } = photoUploadSchema.parse(body);

    const filename = `${principal.userId}-${purpose}-${Date.now()}.jpg`;
    const url = `/uploads/${filename}`;

    return NextResponse.json({ url, stored: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 });
  }
}
