import { NextResponse } from "next/server";
import { imapConfig } from "@/lib/mail";
import { fetchInboxList } from "@/lib/mail/imap";
import { AppError, toErrorBody } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/mail/inbox — real "Postvak in" of the mailbox the platform
// sends as (info@zekerflex.com), read live over IMAP. Separate from
// /api/admin/mail, which is the local log of what ZekerFlex itself sent.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const cfg = imapConfig();
  if (!cfg) {
    throw AppError.precondition(
      "Geen IMAP-mailbox ingesteld — zet IMAP_HOST/IMAP_USER/IMAP_PASS (of hergebruik de SMTP-gegevens die al staan ingesteld).",
    );
  }
  try {
    const messages = await fetchInboxList(cfg, 50);
    return NextResponse.json({ configured: true, host: cfg.host, messages });
  } catch (err) {
    const { status, body } = toErrorBody(AppError.upstream(`Kon de mailbox niet lezen: ${(err as Error).message}`));
    return NextResponse.json(body, { status });
  }
});
