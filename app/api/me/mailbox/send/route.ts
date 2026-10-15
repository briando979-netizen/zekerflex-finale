import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendViaSmtp } from "@/lib/mail/smtp";
import { buildPlainMessage, isPlainAddress } from "@/lib/mail/compose";
import { describeMailError, recordDashboardSent, requireMailbox, smtpConfigFor } from "@/lib/mail/mailbox-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendSchema = z.object({
  to: z.string().trim().max(254),
  subject: z.string().trim().min(1).max(200),
  text: z.string().min(1).max(20_000),
  inReplyTo: z.string().trim().max(250).optional(),
});

// POST /api/me/mailbox/send — send from the caller's own address through their own SMTP server.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({
      name: "mailbox-send",
      identifier: p.userId,
      limit: 40,
      windowSeconds: 3600,
      message: "Je hebt het maximum aantal berichten per uur bereikt.",
    });
    const input = sendSchema.parse(await request.json().catch(() => ({})));
    if (!isPlainAddress(input.to)) throw AppError.validation("Ongeldig e-mailadres");

    const { conn, password } = await requireMailbox(p.userId);
    const { raw } = buildPlainMessage({
      fromAddress: conn.email,
      fromName: conn.displayName,
      to: input.to,
      subject: input.subject,
      text: input.text,
      inReplyTo: input.inReplyTo ?? null,
    });
    try {
      await sendViaSmtp(await smtpConfigFor(conn, password), { from: conn.email, to: [input.to.trim()], raw });
    } catch (err) {
      throw AppError.upstream(describeMailError(err, conn.smtp, "SMTP"));
    }
    const sent = await recordDashboardSent(p.userId, { to: input.to.trim(), subject: input.subject, text: input.text });
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
