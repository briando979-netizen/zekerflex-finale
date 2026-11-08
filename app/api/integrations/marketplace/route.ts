import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getAvailableIntegrations, getUserIntegrations, installIntegration } from "@/lib/integrations/hub";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category");

    const integrations = await getAvailableIntegrations();
    const filtered = category
      ? integrations.filter((i) => i.category === category)
      : integrations;

    return NextResponse.json({ integrations: filtered });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const schema = z.object({
      integrationId: z.string(),
      configuration: z.record(z.unknown()).optional(),
    });

    const { integrationId, configuration } = schema.parse(body);

    const installed = await installIntegration(principal.userId, integrationId, configuration || {});

    return NextResponse.json({ installed }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Installation failed" },
      { status: 400 }
    );
  }
}
