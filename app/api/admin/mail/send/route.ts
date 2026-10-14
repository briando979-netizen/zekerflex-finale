import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMail, mailShell } from "@/lib/mail";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  to: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000),
});

// POST /api/admin/mail/send — an admin composing and sending an ad-hoc,
// one-off e-mail to any address (a freelancer, an employer contact, a
// prospective company — whoever). Distinct from the automated mail kinds
// elsewhere: this is a human writing a message, not a system notification.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { to, subject, text } = bodySchema.parse(await request.json().catch(() => ({})));

  const html = mailShell(
    subject,
    text
      .split("\n")
      .map((line) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#3C4A42">${line.replace(/</g, "&lt;") || "&nbsp;"}</p>`)
      .join(""),
  );

  const result = await sendMail({
    to,
    replyTo: principal.email,
    kind: "admin-bericht",
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
    metadata: { subject, delivered: result.delivered, transport: result.transport },
  });

  return NextResponse.json({
    ok: true,
    delivered: result.delivered,
    transport: result.transport,
    ...(result.error ? { error: result.error } : {}),
  });
});
