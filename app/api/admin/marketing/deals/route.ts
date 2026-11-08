import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  createDeal,
  listActiveDeals,
  updateDeal,
  deleteDeal,
  dealSchema,
  listDealsByCampaign,
} from "@/lib/marketing/deals";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const campaignId = request.nextUrl.searchParams.get("campaignId");

    let deals;
    if (campaignId) {
      deals = await listDealsByCampaign(campaignId);
    } else {
      deals = await listActiveDeals();
    }

    return NextResponse.json({ deals });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const body = await request.json();

    const deal = await createDeal(body);
    return NextResponse.json({ deal }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const dealId = request.nextUrl.searchParams.get("id");

    if (!dealId) {
      throw AppError.validation("Deal ID required");
    }

    const body = await request.json();
    const deal = await updateDeal(dealId, dealSchema.partial().parse(body));
    return NextResponse.json({ deal });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const dealId = request.nextUrl.searchParams.get("id");

    if (!dealId) {
      throw AppError.validation("Deal ID required");
    }

    await deleteDeal(dealId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
