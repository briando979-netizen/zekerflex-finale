import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import * as appsLib from '@/lib/marketplace/apps';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const principal = await requirePrincipal();
    const { scopes } = await request.json();

    const installation = await appsLib.installApp({
      appId: params.id,
      tenantId: principal.tenantId,
      scopes: scopes || [],
    });

    return NextResponse.json({ installation }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const principal = await requirePrincipal();

    await appsLib.uninstallApp(params.id, principal.tenantId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
