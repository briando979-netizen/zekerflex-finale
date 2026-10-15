import { after, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { fetchInboxList } from "@/lib/mail/imap";
import { describeMailError, imapConfigFor, requireMailbox } from "@/lib/mail/mailbox-connection";
import { scanMailbox } from "@/lib/agenda/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/mailbox/inbox — the 50 newest messages of the caller's own mailbox, live over IMAP.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { conn, password } = await requireMailbox(p.userId);
    try {
      const messages = await fetchInboxList(await imapConfigFor(conn, password), 50);
      // new mail → appointments in the agenda, without making the inbox wait
      after(() => scanMailbox(p.userId));
      return NextResponse.json({ email: conn.email, messages });
    } catch (err) {
      throw AppError.upstream(describeMailError(err, conn.imap, "IMAP"));
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
