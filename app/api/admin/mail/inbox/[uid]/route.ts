import { NextResponse } from "next/server";
import { imapConfig } from "@/lib/mail";
import { fetchMessageText } from "@/lib/mail/imap";
import { AppError, toErrorBody } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/mail/inbox/:uid — the text body of one real inbox message
// (fetched on demand, not preloaded with the list, since it reads the full
// raw message over IMAP).
export const GET = withAdminAccess<{ uid: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const cfg = imapConfig();
  if (!cfg) throw AppError.precondition("Geen IMAP-mailbox ingesteld.");
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) throw AppError.validation("Ongeldig bericht-id");
  try {
    const text = await fetchMessageText(cfg, uid);
    return NextResponse.json({ text });
  } catch (err) {
    const { status, body } = toErrorBody(AppError.upstream(`Kon het bericht niet laden: ${(err as Error).message}`));
    return NextResponse.json(body, { status });
  }
});
