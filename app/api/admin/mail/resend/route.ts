import { NextResponse } from "next/server";
import { z } from "zod";
import { resendStoredMail } from "@/lib/mail";
import { listSentMessages } from "@/lib/mail/store";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.union([
  z.object({ id: z.string().min(4).max(64) }),
  z.object({ allFailed: z.literal(true) }),
]);

// POST /api/admin/mail/resend — retry one failed mail ({ id }) or every
// failed SMTP mail among the most recent 300 ({ allFailed: true }).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(await request.json().catch(() => ({})));
  const ids =
    "id" in body
      ? [body.id]
      : (await listSentMessages(300)).filter((m) => !m.delivered && !m.suppressed && m.transport === "smtp").map((m) => m.id);

  let delivered = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const id of ids) {
    const r = await resendStoredMail(id);
    if (r.delivered) delivered += 1;
    else {
      failed += 1;
      lastError = r.error;
    }
  }

  await recordAudit({
    category: "ADMIN",
    action: "admin.mail.resent",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} verstuurde ${ids.length} mislukte mail(s) opnieuw (${delivered} afgeleverd)`,
    targetType: "mail",
    targetId: "id" in body ? body.id : "all-failed",
    metadata: { count: ids.length, delivered, failed },
  });

  return NextResponse.json({ ok: true, count: ids.length, delivered, failed, ...(lastError ? { error: lastError } : {}) });
});
