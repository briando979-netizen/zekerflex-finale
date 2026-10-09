import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendMail, mailShell } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { CONTACTS } from "@/lib/seo";
import { createLead } from "@/lib/sales/leads";
import { recordServerEvent } from "@/lib/analytics/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  contactName: z.string().trim().min(1).max(160),
  company: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  headcount: z.string().trim().max(40).optional(),
  sector: z.string().trim().max(120).optional(),
  note: z.string().trim().max(2000).optional(),
  consent: z.literal(true),
});

// POST /api/uitzendbureau — public intake for a company wanting uitzendkrachten
// via ZekerFlex's own uitzendbureau, rather than the zzp-marktplaats. Lands as
// a sales lead (source "uitzendbureau") so it shows up both in the general
// sales pipeline and in the dedicated /admin/uitzendbureau overview.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "uitzendbureau-aanvraag",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel aanvragen — probeer het later opnieuw.",
    });

    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    }
    const d = parsed.data;

    const noteParts: string[] = [];
    if (d.headcount) noteParts.push(`Aantal medewerkers: ${d.headcount}`);
    if (d.sector) noteParts.push(`Sector: ${d.sector}`);
    if (d.note) noteParts.push(d.note);

    const lead = await createLead({
      companyName: d.company,
      contactName: d.contactName,
      contactEmail: d.email,
      contactPhone: d.phone,
      source: "uitzendbureau",
      sourceUrl: "/uitzendbureau",
      notes: noteParts.join("\n") || undefined,
      createdById: null,
    });

    void recordServerEvent({
      path: "/uitzendbureau",
      label: "uitzendbureau-aanvraag",
      meta: { company: d.company, ref: lead.id },
    });

    await sendMail({
      to: CONTACTS.uitzendbureau,
      replyTo: d.email,
      kind: "uitzendbureau-aanvraag",
      subject: `Uitzendbureau-aanvraag — ${d.company}`,
      text: `Nieuwe aanvraag via zekerflex.com/uitzendbureau\n\nBedrijf: ${d.company}\nContactpersoon: ${d.contactName}\nE-mail: ${d.email}\n${d.phone ? `Telefoon: ${d.phone}\n` : ""}${d.headcount ? `Aantal medewerkers: ${d.headcount}\n` : ""}${d.sector ? `Sector: ${d.sector}\n` : ""}${d.note ? `\nToelichting:\n${d.note}\n` : ""}\nReferentie: ${lead.id}`,
      html: mailShell(
        "Nieuwe uitzendbureau-aanvraag",
        `<p style="margin:0 0 4px"><strong>${d.company}</strong></p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${d.contactName} · ${d.email}${
           d.phone ? ` · ${d.phone}` : ""
         }</p>
         ${d.headcount ? `<p style="margin:0 0 4px;font-size:14px;color:#3C4A42"><strong>Aantal medewerkers:</strong> ${d.headcount}</p>` : ""}
         ${d.sector ? `<p style="margin:0 0 4px;font-size:14px;color:#3C4A42"><strong>Sector:</strong> ${d.sector}</p>` : ""}
         ${d.note ? `<p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap">${d.note.replace(/</g, "&lt;")}</p>` : ""}
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${lead.id}</p>`,
      ),
    }).catch((e) => logger.warn("uitzendbureau notify failed", { error: (e as Error).message }));

    await sendMail({
      to: d.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.uitzendbureau,
      kind: "uitzendbureau-aanvraag-bevestiging",
      subject: "Je aanvraag bij het ZekerFlex-uitzendbureau",
      text: `Hoi ${d.contactName},\n\nBedankt voor je aanvraag voor het ZekerFlex-uitzendbureau. We nemen binnen één werkdag contact met je op om de mogelijkheden te bespreken.\n\nTot snel!`,
      html: mailShell(
        "Aanvraag ontvangen",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${d.contactName}, bedankt voor je aanvraag voor het ZekerFlex-uitzendbureau. We nemen binnen één werkdag contact met je op om de mogelijkheden te bespreken.</p>`,
      ),
    }).catch(() => undefined);

    logger.info("uitzendbureau request received", { id: lead.id, company: d.company });
    return NextResponse.json({ ok: true, id: lead.id });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("uitzendbureau request failed", { error: (err as Error).message });
    return res;
  }
}
