import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { listSubscribers, saveCampaign } from "@/lib/newsletter/store";
import { newsletterBroadcastEmail } from "@/lib/newsletter/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 5000;

const schema = z.object({
  subject: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(20000),
  test: z.boolean().optional(),
});

// POST /api/admin/nieuwsbrief/send — broadcast one issue to every confirmed
// subscriber (or, with { test: true }, only to the sending admin).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const { subject, body, test } = schema.parse(await request.json().catch(() => ({})));

    const confirmed = await listSubscribers("confirmed");
    if (!test && confirmed.length === 0) {
      throw AppError.precondition("Er zijn nog geen bevestigde abonnees.");
    }
    if (confirmed.length > MAX_RECIPIENTS) {
      throw AppError.precondition(
        `Te veel ontvangers (${confirmed.length}). Splits de verzending of verhoog de limiet.`,
      );
    }

    const targets = test
      ? [{ email: principal.email, token: "preview" }]
      : confirmed.map((s) => ({ email: s.email, token: s.token }));

    let delivered = 0;
    let failed = 0;
    for (const t of targets) {
      const res = await sendMail(newsletterBroadcastEmail(t.email, t.token, subject, body)).catch(
        () => null,
      );
      if (res?.delivered) delivered += 1;
      else failed += 1;
    }

    if (!test) {
      const campaign = await saveCampaign({
        subject,
        bodyText: body,
        sentById: principal.userId,
        sentByEmail: principal.email,
        recipients: targets.length,
        delivered,
        failed,
      });
      await recordAudit({
        category: "ADMIN",
        action: "newsletter.sent",
        actorUserId: principal.userId,
        actorLabel: "user",
        summary: `Nieuwsbrief "${subject}" verstuurd naar ${targets.length} abonnees (${delivered} afgeleverd)`,
        targetType: "newsletterCampaign",
        targetId: campaign.id,
        metadata: { recipients: targets.length, delivered, failed },
      });
    }

    logger.info("newsletter broadcast", { test: Boolean(test), recipients: targets.length, delivered, failed });
    return NextResponse.json({ ok: true, test: Boolean(test), recipients: targets.length, delivered, failed });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("newsletter send failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
