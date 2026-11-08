import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const enrollSchema = z.object({
  type: z.enum(['fingerprint', 'face', 'iris']),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const credentials = await prisma.biometricCredential.findMany({
      where: { userId: principal.userId },
    });

    return NextResponse.json(credentials);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { type } = enrollSchema.parse(body);

    const credential = await prisma.biometricCredential.create({
      data: {
        userId: principal.userId,
        type,
        enrolled: true,
      },
    });

    return NextResponse.json(credential, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to enroll biometric' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const credentialId = request.nextUrl.pathname.split('/').pop();

    if (!credentialId) {
      return NextResponse.json({ error: 'Credential ID required' }, { status: 400 });
    }

    await prisma.biometricCredential.delete({
      where: { id: credentialId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 });
  }
}
