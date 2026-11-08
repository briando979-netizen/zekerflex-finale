import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import * as partnersLib from '@/lib/marketplace/partners';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createPartnerSchema = z.object({
  tenantId: z.string(),
  type: z.enum(['INTEGRATION', 'RESELLER', 'AGENCY', 'CONSULTANT', 'TECHNOLOGY', 'TRAINING', 'DATA', 'RESEARCH']),
  primaryContactEmail: z.string().email(),
  tier: z.enum(['SILVER', 'GOLD', 'PLATINUM']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type');

    if (type) {
      const partners = await partnersLib.getPartnersByType(type as any);
      return NextResponse.json({ partners });
    }

    const topPartners = await partnersLib.getTopPartners(20);
    return NextResponse.json({ partners: topPartners });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole('PLATFORM_ADMIN');
    const body = await request.json();
    const data = createPartnerSchema.parse(body);

    const partner = await partnersLib.createPartner(data);

    return NextResponse.json({ partner }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
