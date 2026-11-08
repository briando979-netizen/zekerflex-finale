import { NextRequest, NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { trackCampaignView, trackCampaignClick } from "@/lib/marketing/campaigns";
import { trackDealView, trackDealClick } from "@/lib/marketing/deals";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id, action } = body;

    if (!type || !id || !action) {
      throw AppError.validation("Type, ID, and action required");
    }

    if (action === "view") {
      if (type === "campaign") {
        await trackCampaignView(id);
      } else if (type === "deal") {
        await trackDealView(id);
      }
    } else if (action === "click") {
      if (type === "campaign") {
        await trackCampaignClick(id);
      } else if (type === "deal") {
        await trackDealClick(id);
      }
    }

    return NextResponse.json({ tracked: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
