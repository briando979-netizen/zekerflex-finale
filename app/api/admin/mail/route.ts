import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { smtpConfigured } from "@/lib/mail";
import { listSentMessages, mailboxStats } from "@/lib/mail/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/mail — the local mailbox + transport status. Read-only.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

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
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
