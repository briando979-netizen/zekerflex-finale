import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { markLeadInvited } from "@/lib/sales/leads";
import { signEmployerInvite, inviteUrl } from "@/lib/sales/invite";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sales/leads/<id>/invite — stuur het bedrijf een account-uitnodiging.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    requireRole(p, "SALES", "PLATFORM_ADMIN");

    const lead = await prisma.salesLead.findUnique({ where: { id: params.id } });
    if (!lead) throw AppError.notFound("Lead niet gevonden");
    if (lead.createdById !== p.userId && !p.grants.some((g) => g.role === "PLATFORM_ADMIN")) {
      throw AppError.forbidden("Dit is niet jouw lead.");
    }
    if (!lead.contactEmail) {
      throw AppError.precondition("Vul eerst een e-mailadres van de contactpersoon in.");
    }

    const token = await signEmployerInvite({
      leadId: lead.id,
      companyName: lead.companyName,
      ...(lead.kvkNumber ? { kvkNumber: lead.kvkNumber } : {}),
      ...(lead.contactName ? { contactName: lead.contactName } : {}),
      contactEmail: lead.contactEmail,
      repName: p.fullName,
    });
    const url = inviteUrl(token);
    const first = (lead.contactName ?? lead.companyName).split(" ")[0];

    await sendMail({
      to: lead.contactEmail,
      subject: `Je ZekerFlex-account voor ${lead.companyName} staat klaar`,
      kind: "sales-invite",
      text:
        `Hoi ${first},\n\n${p.fullName} van ZekerFlex heeft alvast een account voor ${lead.companyName} klaargezet. ` +
        `Rond je aanmelding af via onderstaande link — je gegevens zijn al ingevuld:\n${url}\n\n` +
        `Deze link is 14 dagen geldig.`,
      html: mailShell(
        "Je account staat klaar",
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${first}, ${p.fullName} van ZekerFlex heeft alvast een account voor <strong>${lead.companyName}</strong> klaargezet.</p>
         <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Rond je aanmelding in een paar minuten af — je bedrijfsgegevens zijn al ingevuld.</p>
         <p style="margin:0 0 20px">${mailButton(url, "Aanmelding afronden")}</p>
         <p style="margin:0;font-size:12px;color:#667469">De link is 14 dagen geldig. Werkt de knop niet? Kopieer: <br><span style="word-break:break-all">${url}</span></p>`,
      ),
    }).catch(() => undefined);

    const updated = await markLeadInvited(lead.id, p.userId);
    return NextResponse.json({ lead: updated, inviteUrl: env.APP_BASE_URL ? url : undefined });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
