import { NextResponse } from "next/server";
import { briefing, verifyCompanion } from "@/lib/companion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/companion/briefing — spoken morning summary for the desktop Jarvis.
export async function GET(request: Request): Promise<NextResponse> {
  const owner = await verifyCompanion(request);
  if (!owner) return NextResponse.json({ error: { message: "Ongeldige of ingetrokken Jarvis-sleutel" } }, { status: 401 });
  return NextResponse.json({ text: await briefing() });
}
