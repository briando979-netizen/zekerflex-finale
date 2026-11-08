import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { z } from "zod";
import * as smsCampaigns from "@/lib/sms/campaigns";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

const campaignSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1).max(160),
  segments: z.string().array(),
  scheduledFor: z.string().datetime(),
  shortcode: z.string().optional(),
  longcode: z.string().optional(),
  complianceOpted: z.boolean(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const principal = await requirePrincipal();
    const tenant = await (await import("@/lib/auth")).getTenant(principal);

    const campaigns = await smsCampaigns.listCampaigns(tenant.id);
    return NextResponse.json({ campaigns });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const principal = await requirePrincipal();
    const tenant = await (await import("@/lib/auth")).getTenant(principal);

    const body = await request.json();
    const data = campaignSchema.parse({
      ...body,
      scheduledFor: new Date(body.scheduledFor),
    });

    const campaign = await smsCampaigns.createCampaign(data, tenant.id);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
