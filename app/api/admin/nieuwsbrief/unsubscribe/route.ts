import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeEmail, unsubscribeByEmail } from "@/lib/newsletter/store";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().min(3).max(254) });

// POST /api/admin/nieuwsbrief/unsubscribe — admin meldt een abonnee handmatig
// af (bv. op verzoek via telefoon/e-mail, of een bounced adres opruimen).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { email: raw } = schema.parse(await request.json());
  const email = normalizeEmail(raw);
  if (!email) throw AppError.validation("Ongeldig e-mailadres");

  try {
    const subscriber = await unsubscribeByEmail(email);
    if (!subscriber) throw AppError.notFound("Abonnee niet gevonden");

    await recordAudit({
      category: "ADMIN",
      action: "newsletter.unsubscribed_by_admin",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${email} handmatig afgemeld door admin`,
      targetType: "newsletter-subscriber",
      targetId: email,
    });

    return NextResponse.json({ subscriber });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
});
