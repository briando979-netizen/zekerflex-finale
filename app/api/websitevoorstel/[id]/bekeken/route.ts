import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { isProposalId, recordProposalView } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/websitevoorstel/<id>/bekeken — sent by the page itself once it is
// open in a browser, so a link preview (WhatsApp, mail) does not count as a
// visit. Our own staff's visits are not sent (the page knows who is looking).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  if (!isProposalId(id)) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    await enforceRateLimit({ name: "websitevoorstel-bekeken", identifier: clientIp(request), limit: 20, windowSeconds: 600, message: "Te vaak." });
  } catch {
    return NextResponse.json({ ok: true });
  }
  await recordProposalView(id).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
