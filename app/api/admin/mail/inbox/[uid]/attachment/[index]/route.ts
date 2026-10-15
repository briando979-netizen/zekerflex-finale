import { NextResponse } from "next/server";
import { imapConfig } from "@/lib/mail";
import { fetchAttachment } from "@/lib/mail/imap";
import { AppError, toErrorBody } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/mail/inbox/:uid/attachment/:index — downloads one
// attachment from a real inbox message, re-fetched on demand (nothing is
// cached server-side).
export const GET = withAdminAccess<{ uid: string; index: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const cfg = imapConfig();
  if (!cfg) throw AppError.precondition("Geen IMAP-mailbox ingesteld.");
  const uid = Number(params.uid);
  const index = Number(params.index);
  if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(index) || index < 0) {
    throw AppError.validation("Ongeldig bericht- of bijlage-id");
  }
  try {
    const attachment = await fetchAttachment(cfg, uid, index);
    if (!attachment) throw AppError.notFound("Bijlage niet gevonden");
    return new NextResponse(new Uint8Array(attachment.bytes), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
        "Content-Length": String(attachment.bytes.length),
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(
      err instanceof AppError ? err : AppError.upstream(`Kon de bijlage niet laden: ${(err as Error).message}`),
    );
    return NextResponse.json(body, { status });
  }
});
