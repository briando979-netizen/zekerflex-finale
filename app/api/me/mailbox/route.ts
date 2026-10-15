import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fetchInboxList } from "@/lib/mail/imap";
import { verifySmtp } from "@/lib/mail/smtp";
import { OAUTH_ONLY_DOMAINS, OAUTH_ONLY_NOTE, domainOf } from "@/lib/mail/presets";
import { resetMailScanState } from "@/lib/agenda/store";
import {
  deleteMailboxConnection,
  describeMailError,
  getMailboxConnection,
  imapConfigFor,
  publicConnection,
  saveMailboxConnection,
  sealMailboxPassword,
  smtpConfigFor,
  type MailboxConnection,
} from "@/lib/mail/mailbox-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const server = z.object({
  host: z.string().trim().toLowerCase().min(3).max(253),
  port: z.number().int(),
  secure: z.boolean(),
});

const connectSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
  displayName: z.string().trim().max(80).optional(),
  username: z.string().trim().max(254).optional(),
  imap: server,
  smtp: server,
});

// GET /api/me/mailbox — is a mailbox connected (never returns the password).
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const conn = await getMailboxConnection(p.userId);
    return NextResponse.json({ connected: Boolean(conn), connection: conn ? publicConnection(conn) : null });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT /api/me/mailbox — connect: log in to both servers first, store only if both work.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    // Each attempt logs in to a third-party server: no password guessing through us.
    await enforceRateLimit({
      name: "mailbox-connect",
      identifier: p.userId,
      limit: 6,
      windowSeconds: 600,
      message: "Te veel koppelpogingen — probeer het over tien minuten opnieuw.",
    });
    const input = connectSchema.parse(await request.json().catch(() => ({})));

    if (OAUTH_ONLY_DOMAINS.includes(domainOf(input.email)) || /office365|outlook\.com$/.test(input.imap.host)) {
      throw AppError.validation(OAUTH_ONLY_NOTE);
    }
    if (!(input.imap.port === 993 && input.imap.secure)) {
      throw AppError.validation("Alleen een versleutelde IMAP-verbinding is toegestaan (poort 993, SSL/TLS).");
    }
    if (!((input.smtp.port === 465 && input.smtp.secure) || (input.smtp.port === 587 && !input.smtp.secure))) {
      throw AppError.validation("Alleen versleuteld versturen is toegestaan: SMTP-poort 465 (SSL/TLS) of 587 (STARTTLS).");
    }

    const settings = { username: input.username || input.email, imap: input.imap, smtp: input.smtp };
    try {
      await fetchInboxList(await imapConfigFor(settings, input.password), 1);
    } catch (err) {
      throw AppError.validation(describeMailError(err, input.imap, "IMAP"));
    }
    try {
      await verifySmtp(await smtpConfigFor(settings, input.password));
    } catch (err) {
      throw AppError.validation(describeMailError(err, input.smtp, "SMTP"));
    }

    const conn: MailboxConnection = {
      userId: p.userId,
      email: input.email,
      displayName: input.displayName || null,
      ...settings,
      passwordSealed: sealMailboxPassword(input.password),
      connectedAt: new Date().toISOString(),
    };
    await saveMailboxConnection(conn);
    await resetMailScanState(p.userId);
    await recordAudit({
      category: "SECURITY",
      action: "mailbox.connected",
      actorUserId: p.userId,
      summary: `Eigen mailbox ${conn.email} gekoppeld (${conn.imap.host})`,
      targetType: "mailbox",
      targetId: p.userId,
    });
    return NextResponse.json({ connected: true, connection: publicConnection(conn) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/me/mailbox — disconnect and forget the password.
export async function DELETE(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const conn = await getMailboxConnection(p.userId);
    if (conn) {
      await deleteMailboxConnection(p.userId);
      await resetMailScanState(p.userId);
      await recordAudit({
        category: "SECURITY",
        action: "mailbox.disconnected",
        actorUserId: p.userId,
        summary: `Eigen mailbox ${conn.email} ontkoppeld`,
        targetType: "mailbox",
        targetId: p.userId,
      });
    }
    return NextResponse.json({ connected: false });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
