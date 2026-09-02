import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(8000),
});

// POST /api/admin/bedrijven/<id>/email — mails every HQ_ADMIN of this tenant.
export async function POST(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const { subject, body } = schema.parse(await request.json().catch(() => ({})));
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: {
        name: true,
        memberships: {
          where: { role: "HQ_ADMIN" },
          select: { user: { select: { email: true } } },
        },
      },
    });
    if (!tenant) throw AppError.notFound("Organisatie niet gevonden");

    const recipients = [...new Set(tenant.memberships.map((m) => m.user.email))];
    if (recipients.length === 0) throw AppError.precondition("Deze organisatie heeft geen beheerder om te mailen.");

    let delivered = 0;
    for (const to of recipients) {
      const res = await sendMail({
        to,
        kind: "support",
        replyTo: "support@zekerflex.com",
        subject,
        text: body,
        html: mailShell(subject, `<p style="margin:0;font-size:15px;line-height:1.6;color:#3C4A42;white-space:pre-wrap">${body.replace(/</g, "&lt;")}</p>`),
      }).catch(() => null);
      if (res?.delivered) delivered += 1;
    }

    await recordAudit({
      category: "COMPANY",
      action: "admin.company.emailed",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} mailde ${tenant.name} (${recipients.length} ontvanger${recipients.length === 1 ? "" : "s"}): "${subject}"`,
      targetType: "tenant",
      targetId: params.id,
    });

    return NextResponse.json({ ok: true, recipients: recipients.length, delivered });
  } catch (err) {
    const { status, body: errBody } = toErrorBody(err);
    return NextResponse.json(errBody, { status });
  }
}
