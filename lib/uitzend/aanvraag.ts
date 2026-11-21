import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { aanvraagMail } from "@/lib/uitzend/aanvraag-tekst";

// ---------------------------------------------------------------------------
// "Vraag uitzendcontract aan" op een klus van een uitzendpartner (lib/uitzend/partners-kern.ts): de toestemming van de
// werker gaat in het auditspoor en de beheerders van het bureau krijgen zijn contactgegevens per mail, met de werker als
// Reply-To. Best effort: een mislukte mail houdt de reactie niet tegen (die staat al in het dashboard van het bureau).
// ---------------------------------------------------------------------------

const wanneer = (d: Date) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

export async function meldUitzendcontractAanvraag(args: { workerUserId: string; shiftId: string }): Promise<void> {
  try {
    const [werker, klus] = await Promise.all([
      prisma.user.findUnique({ where: { id: args.workerUserId }, select: { fullName: true, email: true, phone: true } }),
      prisma.shift.findUnique({
        where: { id: args.shiftId },
        select: { title: true, startsAt: true, branch: { select: { tenantId: true, tenant: { select: { name: true } } } } },
      }),
    ]);
    if (!werker || !klus) return;
    const tenantId = klus.branch.tenantId;

    await recordAudit({
      category: "MATCHING",
      action: "uitzendpartner.aanvraag",
      actorUserId: args.workerUserId,
      actorLabel: "user",
      summary: `Uitzendcontract aangevraagd bij ${klus.branch.tenant.name}; toestemming om naam, e-mail en telefoon te delen`,
      targetType: "shift",
      targetId: args.shiftId,
      metadata: { tenantId },
    });

    const beheerders = await prisma.membership.findMany({
      where: { tenantId, role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] }, user: { disabledAt: null } },
      select: { user: { select: { email: true } } },
      take: 10,
    });
    const aan = [...new Set(beheerders.map((b) => b.user.email).filter(Boolean))];
    if (aan.length === 0) return;
    const mail = aanvraagMail({
      bureau: klus.branch.tenant.name,
      werker: { naam: werker.fullName, email: werker.email, telefoon: werker.phone },
      klus: { titel: klus.title, wanneer: wanneer(klus.startsAt) },
      link: `${env.APP_BASE_URL.replace(/\/+$/, "")}/werkgever/diensten/${args.shiftId}`,
    });
    for (const to of aan) await sendMail({ to, subject: mail.subject, text: mail.text, kind: "uitzendcontract-aanvraag", replyTo: werker.email });
  } catch (err) {
    logger.warn("uitzendcontract-aanvraag: melding aan het bureau mislukt", { shiftId: args.shiftId, error: (err as Error).message });
  }
}
