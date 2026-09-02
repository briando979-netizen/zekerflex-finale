import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().trim().min(3).max(2000) });

// POST /api/admin/gebruikers/<id>/waarschuwing — records a formal warning in
// the auditspoor and, best-effort, notifies the user by e-mail.
export async function POST(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const { reason } = schema.parse(await request.json().catch(() => ({})));
    const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, fullName: true, email: true } });
    if (!user) throw AppError.notFound("Gebruiker niet gevonden");

    await recordAudit({
      category: "SECURITY",
      action: "admin.user.warned",
      severity: "warning",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} gaf een waarschuwing aan ${user.fullName}: ${reason.slice(0, 140)}`,
      targetType: "user",
      targetId: params.id,
      metadata: { reason },
    });

    await sendMail({
      to: user.email,
      kind: "support",
      replyTo: "support@zekerflex.com",
      subject: "Waarschuwing van ZekerFlex",
      text: `Hoi ${user.fullName.split(" ")[0] || user.fullName},\n\nWe hebben een waarschuwing voor je account genoteerd:\n\n${reason}\n\nVragen? Mail support@zekerflex.com.`,
      html: mailShell(
        "Waarschuwing",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${
          user.fullName.split(" ")[0] || user.fullName
        }, we hebben een waarschuwing voor je account genoteerd:</p>
         <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#17211C;white-space:pre-wrap">${reason.replace(/</g, "&lt;")}</p>
         <p style="margin:0;font-size:12px;color:#667469">Vragen? Mail support@zekerflex.com.</p>`,
      ),
    }).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
