import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createRFQ, getRFQ, submitQuote, evaluateQuotes, createContract } from "@/lib/vendors";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireRole("PROCUREMENT_MANAGER");
    const action = request.nextUrl.searchParams.get("action");
    const body = await request.json();

    if (action === "create-rfq") {
      const rfq = await createRFQ(body);
      return NextResponse.json({ rfq }, { status: 201 });
    } else if (action === "submit-quote") {
      const result = await submitQuote(body.rfqId, body.vendorId, body.amount, body.deliveryDate, body.terms);
      return NextResponse.json(result);
    } else if (action === "evaluate") {
      const result = await evaluateQuotes(body.rfqId);
      return NextResponse.json(result);
    } else if (action === "create-contract") {
      const contract = await createContract(body.vendorId, body);
      return NextResponse.json({ contract }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireRole("PROCUREMENT_MANAGER");
    const rfqId = request.nextUrl.searchParams.get("rfqId");
    if (!rfqId) return NextResponse.json({ error: "RFQ ID required" }, { status: 400 });

    const rfq = await getRFQ(rfqId);
    return NextResponse.json({ rfq });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
