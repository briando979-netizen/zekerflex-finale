import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as proposals from "@/lib/proposals/builder";
import * as analytics from "@/lib/proposals/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "analytics") {
      const startDate = new Date(searchParams.get("startDate") || Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(searchParams.get("endDate") || Date.now());

      const data = await analytics.getProposalAnalytics(principal.tenantId, startDate, endDate);
      return NextResponse.json(data);
    }

    const list = await proposals.listProposals(principal.tenantId, {
      status: searchParams.get("status") || undefined,
      clientId: searchParams.get("clientId") || undefined,
    });

    return NextResponse.json({ proposals: list });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const proposal = await proposals.createProposal({
      ...body,
      clientId: body.clientId,
    });

    return NextResponse.json({ proposal }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const proposalId = searchParams.get("id");

    if (!proposalId) throw AppError.validation("Proposal ID required");

    const body = await request.json();
    const updated = await proposals.updateProposal(proposalId, body);

    return NextResponse.json({ proposal: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
