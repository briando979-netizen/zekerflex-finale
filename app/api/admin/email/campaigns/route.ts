import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { getCampaigns, createCampaign, getCampaignAnalytics } from "@/lib/email/campaigns";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const status = request.nextUrl.searchParams.get("status");

    if (!tenantId) {
      throw AppError.validation("tenantId required");
    }

    const campaigns = await getCampaigns(tenantId, status ?? undefined);
    return NextResponse.json({ campaigns });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const tenantId = body.tenantId;

    if (!tenantId) {
      throw AppError.validation("tenantId required");
    }

    const campaign = await createCampaign(tenantId, body);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
