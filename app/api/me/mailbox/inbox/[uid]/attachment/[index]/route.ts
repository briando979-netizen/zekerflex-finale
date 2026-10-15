import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { fetchAttachment } from "@/lib/mail/imap";
import { attachmentResponse } from "@/lib/mail/attachment-response";
import { describeMailError, imapConfigFor, requireMailbox } from "@/lib/mail/mailbox-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/mailbox/inbox/:uid/attachment/:index — download one attachment, fetched on demand.
export async function GET(
  _req: Request,
  props: { params: Promise<{ uid: string; index: string }> },
): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const uid = Number(params.uid);
    const index = Number(params.index);
    if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(index) || index < 0) {
      throw AppError.validation("Ongeldig bericht- of bijlage-id");
    }
    const { conn, password } = await requireMailbox(p.userId);
    let attachment: Awaited<ReturnType<typeof fetchAttachment>>;
    try {
      attachment = await fetchAttachment(await imapConfigFor(conn, password), uid, index);
    } catch (err) {
      throw AppError.upstream(describeMailError(err, conn.imap, "IMAP"));
    }
    if (!attachment) throw AppError.notFound("Bijlage niet gevonden");
    return attachmentResponse(attachment);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
