import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { searchMessages, filterMessages } from "@/lib/chat/search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const query = request.nextUrl.searchParams.get("q") || "";

    const results = await searchMessages(query, principal.userId);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const filters = await request.json();

    const results = await filterMessages(principal.userId, filters);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
