import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { listDashboardSent } from "@/lib/mail/mailbox-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/mailbox/sent — mail the caller sent from the dashboard.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ messages: await listDashboardSent(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
