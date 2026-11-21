import { NextResponse } from "next/server";
import { getMailTools, withSignature } from "@/lib/mail/tools";
import { z } from "zod";
import { sendMail, mailShell } from "@/lib/mail";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  to: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000),
  /** "verkoop" (21 nov 2026): een verkoopbericht. Gaat als "sales-outreach" via de eigen verkoopmailbox, met afmeldregel, van
   * en met antwoorden naar sales@; zonder verkoopmailbox wordt hij niet verstuurd (lib/mail/verkoop-mailbox.ts). */
  soort: z.enum(["verkoop"]).optional(),
});

// POST /api/admin/mail/send — an admin composing and sending an ad-hoc,
// one-off e-mail to any address (a freelancer, an employer contact, a
// prospective company — whoever). Distinct from the automated mail kinds
// elsewhere: this is a human writing a message, not a system notification.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = bodySchema.parse(await request.json().catch(() => ({})));
  const { to, subject } = parsed;
  const text = withSignature(parsed.text, await getMailTools(principal.userId).catch(() => ({ signature: "", appendSignature: false })));

  const html = mailShell(
    subject,
    text
      .split("\n")
      .map((line) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#3C4A42">${line.replace(/</g, "&lt;") || "&nbsp;"}</p>`)
      .join(""),
  );

  const verkoop = parsed.soort === "verkoop";
  const result = await sendMail({
    to,
    ...(verkoop ? { from: env.MAIL_SALES_FROM, replyTo: env.MAIL_SALES_FROM } : { replyTo: principal.email }),
    kind: verkoop ? "sales-outreach" : "admin-bericht",
    subject,
    text,
    html,
  });

  await recordAudit({
    category: "ADMIN",
    action: "admin.mail.sent",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} stuurde een e-mail naar ${to}: "${subject}"`,
    targetType: "mail",
    targetId: to,
    metadata: { subject, delivered: result.delivered, transport: result.transport, ...(verkoop ? { soort: "verkoop" } : {}) },
  });

  return NextResponse.json({
    ok: true,
    delivered: result.delivered,
    transport: result.transport,
    ...(result.error ? { error: result.error } : {}),
  });
});
