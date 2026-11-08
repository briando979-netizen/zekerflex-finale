import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import * as appsLib from '@/lib/marketplace/apps';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createAppSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(10),
  category: z.enum(['INTEGRATION', 'AUTOMATION', 'REPORTING', 'ANALYTICS', 'PAYMENT', 'COMMUNICATION', 'PRODUCTIVITY', 'SECURITY', 'TRAINING', 'CUSTOM']),
});

export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get('category');
    const published = request.nextUrl.searchParams.get('published') === 'true';

    let apps;
    if (published) {
      apps = await appsLib.getPublishedApps(category as any);
    } else {
      const principal = await requirePrincipal();
      const tenant = await prisma.tenant.findUnique({
        where: { id: principal.tenantId },
      });
      if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

      apps = await appsLib.getAppsByDeveloper(tenant.id);
    }

    return NextResponse.json({ apps });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = createAppSchema.parse(body);

    const app = await appsLib.createApp({
      ...data,
      developerTenantId: principal.tenantId,
    });

    return NextResponse.json({ app }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
