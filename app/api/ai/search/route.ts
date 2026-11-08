import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { semanticSearch, autoSuggest } from "@/lib/ai/engine-index";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!q) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    const results = await semanticSearch(q, limit);
    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "suggest") {
      const { prefix } = await request.json();
      const suggestions = autoSuggest(prefix);
      return NextResponse.json({ suggestions }, { status: 200 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
