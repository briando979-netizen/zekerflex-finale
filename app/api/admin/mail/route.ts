import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { smtpConfigured } from "@/lib/mail";
import { listSentMessages, mailboxStats } from "@/lib/mail/store";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/mail — the local mailbox + transport status. Read-only.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [messages, stats] = await Promise.all([listSentMessages(80), mailboxStats()]);
  return NextResponse.json({
    transport: {
      smtp: smtpConfigured(),
      host: env.SMTP_HOST ?? null,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: Boolean(env.SMTP_USER),
      from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`,
      admin: env.MAIL_ADMIN,
    },
    stats,
    messages,
  });
});
