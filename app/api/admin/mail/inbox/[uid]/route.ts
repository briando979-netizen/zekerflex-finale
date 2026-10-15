import { NextResponse } from "next/server";
import { imapConfig } from "@/lib/mail";
import { fetchMessageContent } from "@/lib/mail/imap";
import { AppError, toErrorBody } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/mail/inbox/:uid — the text body + attachment list of one
// real inbox message (fetched on demand, not preloaded with the list, since
// it reads the full raw message over IMAP). Attachment bytes themselves are
// fetched separately, per attachment, via .../attachment/:index.
export const GET = withAdminAccess<{ uid: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const cfg = imapConfig();
  if (!cfg) throw AppError.precondition("Geen IMAP-mailbox ingesteld.");
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) throw AppError.validation("Ongeldig bericht-id");
  try {
    const content = await fetchMessageContent(cfg, uid);
    return NextResponse.json(content);
  } catch (err) {
    const { status, body } = toErrorBody(AppError.upstream(`Kon het bericht niet laden: ${(err as Error).message}`));
    return NextResponse.json(body, { status });
  }
});
