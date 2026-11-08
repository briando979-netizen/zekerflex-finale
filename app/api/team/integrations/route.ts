import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { setupIntegration, listChannelIntegrations, updateIntegration } from "@/lib/collab/integration";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const channelId = request.nextUrl.searchParams.get("channelId");
    if (!channelId) throw AppError.validation("channelId required");
    const integrations = await listChannelIntegrations(channelId);
    return NextResponse.json({ integrations });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { channelId, ...data } = body;
    if (!channelId) throw AppError.validation("channelId required");
    const integration = await setupIntegration(channelId, principal.userId, data);
    return NextResponse.json({ integration }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const integrationId = request.nextUrl.searchParams.get("id");
    if (!integrationId) throw AppError.validation("id required");
    const body = await request.json();
    const integration = await updateIntegration(integrationId, body.config);
    return NextResponse.json({ integration });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
