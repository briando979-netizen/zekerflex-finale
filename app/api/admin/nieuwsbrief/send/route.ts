import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { saveCampaign } from "@/lib/newsletter/store";
import { newsletterBroadcastEmail } from "@/lib/newsletter/mail";
import { AUDIENCES, AUDIENCE_LABEL, resolveAudience, type Recipient } from "@/lib/newsletter/audience";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_RECIPIENTS = 5000;
// Kept low: every mail is its own SMTP login and TransIP throttles bursts.
const PARALLEL = 2;

const schema = z.object({
  subject: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(20000),
  audience: z.enum(AUDIENCES).default("subscribers"),
  test: z.boolean().optional(),
});

// POST /api/admin/nieuwsbrief/send — broadcast one mail to the chosen
// audience (newsletter subscribers, all/some account holders, or both), or,
// with { test: true }, only to the sending admin.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { subject, body, audience, test } = schema.parse(await request.json().catch(() => ({})));

  const recipients = test ? [] : await resolveAudience(audience);
  if (!test && recipients.length === 0) {
    throw AppError.precondition(`Geen ontvangers in "${AUDIENCE_LABEL[audience]}".`);
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw AppError.precondition(
      `Te veel ontvangers (${recipients.length}). Splits de verzending of verhoog de limiet.`,
    );
  }

  const targets: Recipient[] = test
    ? [{ email: principal.email, token: "preview", reason: audience === "subscribers" ? "subscriber" : "account" }]
    : recipients;

  let delivered = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += PARALLEL) {
    const results = await Promise.all(
      targets
        .slice(i, i + PARALLEL)
        .map((t) => sendMail(newsletterBroadcastEmail(t.email, t.token, subject, body, t.reason)).catch(() => null)),
    );
    for (const res of results) {
      if (res?.delivered) delivered += 1;
      else failed += 1;
    }
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
      audience,
    });
    await recordAudit({
      category: "ADMIN",
      action: "newsletter.sent",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Mail "${subject}" verstuurd naar ${targets.length} ontvangers (${AUDIENCE_LABEL[audience]}, ${delivered} afgeleverd)`,
      targetType: "newsletterCampaign",
      targetId: campaign.id,
      metadata: { audience, recipients: targets.length, delivered, failed },
    });
  }

  logger.info("newsletter broadcast", { test: Boolean(test), audience, recipients: targets.length, delivered, failed });
  return NextResponse.json({ ok: true, test: Boolean(test), recipients: targets.length, delivered, failed });
});
