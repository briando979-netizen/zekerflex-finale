import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell } from "@/lib/mail";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(8000),
});

// POST /api/admin/gebruikers/<id>/email — send a one-off e-mail to this user
// (a human wrote it, so it's repliable — Reply-To goes to support@).
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { subject, body } = schema.parse(await request.json().catch(() => ({})));
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, fullName: true, email: true } });
  if (!user) throw AppError.notFound("Gebruiker niet gevonden");

  const res = await sendMail({
    to: user.email,
    kind: "support",
    replyTo: "support@zekerflex.com",
    subject,
    text: body,
    html: mailShell(subject, `<p style="margin:0;font-size:15px;line-height:1.6;color:#3C4A42;white-space:pre-wrap">${body.replace(/</g, "&lt;")}</p>`),
  });

  await recordAudit({
    category: "ADMIN",
    action: "admin.user.emailed",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} mailde ${user.fullName}: "${subject}"`,
    targetType: "user",
    targetId: params.id,
  });

  return NextResponse.json({ ok: true, delivered: res.delivered });
});
