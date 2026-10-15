import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { fetchMessageContent } from "@/lib/mail/imap";
import { describeMailError, imapConfigFor, requireMailbox } from "@/lib/mail/mailbox-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/mailbox/inbox/:uid — one message's text + attachment list (marks it read).
export async function GET(_req: Request, props: { params: Promise<{ uid: string }> }): Promise<NextResponse> {
  const { uid: raw } = await props.params;
  try {
    const p = await requirePrincipal();
    const uid = Number(raw);
    if (!Number.isInteger(uid) || uid <= 0) throw AppError.validation("Ongeldig bericht-id");
    const { conn, password } = await requireMailbox(p.userId);
    try {
      const content = await fetchMessageContent(await imapConfigFor(conn, password), uid);
      return NextResponse.json(content);
    } catch (err) {
      throw AppError.upstream(describeMailError(err, conn.imap, "IMAP"));
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
