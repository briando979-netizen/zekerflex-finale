import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { listSentMessages } from "@/lib/mail/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/mailbox/zekerflex — every mail the platform sent to the caller
// (invoices, approvals, notifications), from the platform's own outbox. Works
// without connecting a mailbox.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const me = p.email.trim().toLowerCase();
    const all = await listSentMessages(5000);
    const messages = all
      .filter((m) => !m.suppressed && m.to.some((t) => t.trim().toLowerCase() === me))
      .slice(0, 100)
      .map((m) => ({ id: m.id, at: m.at, subject: m.subject, text: m.text, kind: m.kind }));
    return NextResponse.json({ email: p.email, messages });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
