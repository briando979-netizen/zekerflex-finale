import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  createCampaign,
  getCampaign,
  listActiveCampaigns,
  updateCampaign,
  deleteCampaign,
  campaignSchema,
} from "@/lib/marketing/campaigns";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const status = request.nextUrl.searchParams.get("status");

    if (status) {
      const campaigns = await (async () => {
        const all = await listActiveCampaigns();
        return all.filter((c) => c.status === status);
      })();
      return NextResponse.json({ campaigns });
    }

    const campaigns = await listActiveCampaigns();
    return NextResponse.json({ campaigns });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const body = await request.json();

    const campaign = await createCampaign(body);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const campaignId = request.nextUrl.searchParams.get("id");

    if (!campaignId) {
      throw AppError.validation("Campaign ID required");
    }

    const body = await request.json();
    const campaign = await updateCampaign(
      campaignId,
      campaignSchema.partial().parse(body)
    );
    return NextResponse.json({ campaign });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const campaignId = request.nextUrl.searchParams.get("id");

    if (!campaignId) {
      throw AppError.validation("Campaign ID required");
    }

    await deleteCampaign(campaignId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
