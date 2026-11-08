import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as integrations from "@/lib/automation/integrations";

export const dynamic = "force-dynamic";

/**
 * GET /api/automation/connectors
 * List connectors
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const searchParams = request.nextUrl.searchParams;

    const type = searchParams.get("type") as integrations.SupportedConnector | null;
    const active = searchParams.get("active") === "true" ? true : undefined;

    const connectors = await integrations.listConnectors(principal.tenantId, {
      type: type ?? undefined,
      active,
    });

    return NextResponse.json({ connectors });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/automation/connectors
 * Create or test connector
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const action = body.action || "create";

    switch (action) {
      case "create":
        const connector = await integrations.setupConnector(
          principal.tenantId,
          body.name,
          body.config
        );
        return NextResponse.json({ connector }, { status: 201 });

      case "test":
        const testResult = await integrations.testConnector(
          principal.tenantId,
          body.connectorId
        );
        return NextResponse.json(testResult);

      case "send":
        const sendResult = await integrations.sendToConnector(
          principal.tenantId,
          body.connectorId,
          body.action,
          body.data
        );
        return NextResponse.json({ result: sendResult });

      case "register_webhook":
        const webhookConnector = await integrations.registerWebhook(
          principal.tenantId,
          body.name,
          body.url,
          body.secret
        );
        return NextResponse.json({ connector: webhookConnector }, { status: 201 });

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PUT /api/automation/connectors/:connectorId
 * Update connector
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const connectorId = request.nextUrl.pathname.split("/").pop();

    if (!connectorId) {
      return NextResponse.json(
        { error: "connectorId is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const connector = await integrations.setupConnector(
      principal.tenantId,
      body.name,
      body.config
    );

    return NextResponse.json({ connector });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
